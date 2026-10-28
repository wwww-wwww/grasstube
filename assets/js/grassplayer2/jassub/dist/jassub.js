import 'rvfc-polyfill';
import { proxy, releaseProxy, transfer } from 'abslink';
import { wrap } from 'abslink/w3c';
import { Debug } from "./debug.js";
export const webYCbCrMap = {
    rgb: 'RGB',
    bt709: 'BT709',
    // these might not be exactly correct? oops?
    bt470bg: 'BT601', // alias BT.601 PAL... whats the difference?
    smpte170m: 'BT601' // alias BT.601 NTSC... whats the difference?
};
export default class JASSUB {
    timeOffset;
    prescaleFactor;
    prescaleHeightLimit;
    maxRenderHeight;
    debug;
    renderer;
    ready;
    busy = false;
    _video;
    _videoWidth = 0;
    _videoHeight = 0;
    _videoColorSpace = null;
    _canvas;
    _ro = new ResizeObserver(async () => {
        await this.ready;
        this.resize();
    });
    _destroyed = false;
    _lastDemandTime;
    _skipped = false;
    _worker;
    _manualPresent;
    constructor(opts) {
        if (!globalThis.Worker)
            throw new Error('Worker not supported');
        if (!opts)
            throw new Error('No options provided');
        if (!opts.video && !opts.canvas)
            throw new Error('You should give video or canvas in options.');
        JASSUB._test();
        this.timeOffset = opts.timeOffset ?? 0;
        this._video = opts.video;
        this._manualPresent = !!opts.manualPresent;
        this._canvas = opts.canvas ?? document.createElement('canvas');
        if (this._video && !opts.canvas && !this._manualPresent) {
            this._canvas.className = 'JASSUB';
            this._canvas.style.position = 'absolute';
            this._canvas.style.pointerEvents = 'none';
            if (opts.canvasParent) {
                opts.canvasParent.appendChild(this._canvas);
            }
            else {
                this._video.insertAdjacentElement('afterend', this._canvas);
            }
        }
        // manualPresent: the worker's canvas is never displayed.
        const ctrl = this._manualPresent ? new OffscreenCanvas(1, 1) : this._canvas.transferControlToOffscreen();
        this.debug = opts.debug ? new Debug() : null;
        this.prescaleFactor = opts.prescaleFactor ?? 1.0;
        this.prescaleHeightLimit = opts.prescaleHeightLimit ?? 1080;
        this.maxRenderHeight = opts.maxRenderHeight ?? 0; // 0 - no limit.
        // yes this is awful, but bundlers check for new Worker(new URL()) patterns, so can't use new Worker(workerUrl ?? new URL(...)) ... bruh
        this._worker = opts.workerUrl
            ? new Worker(opts.workerUrl, { name: 'jassub-worker', type: 'module' })
            : new Worker(new URL('./worker/worker.js', import.meta.url), { name: 'jassub-worker', type: 'module' });
        const Renderer = wrap(this._worker);
        const modern = opts.modernWasmUrl ?? new URL('./wasm/jassub-worker-modern.wasm', import.meta.url).href;
        const normal = opts.wasmUrl ?? new URL('./wasm/jassub-worker.wasm', import.meta.url).href;
        const availableFonts = opts.availableFonts ?? {};
        if (!availableFonts['liberation sans'] && !opts.defaultFont) {
            availableFonts['liberation sans'] = new URL('./default.woff2', import.meta.url).href;
        }
        this.ready = new Renderer({
            wasmUrl: JASSUB._supportsSIMD ? modern : normal,
            width: ctrl.width,
            height: ctrl.height,
            subUrl: opts.subUrl,
            subContent: opts.subContent ?? null,
            fonts: opts.fonts ?? [],
            availableFonts,
            defaultFont: opts.defaultFont ?? 'liberation sans',
            debug: !!opts.debug,
            libassMemoryLimit: opts.libassMemoryLimit ?? 0,
            libassGlyphLimit: opts.libassGlyphLimit ?? 0,
            queryFonts: opts.queryFonts ?? 'local'
        }, proxy(font => this._getLocalFont(font)), transfer(ctrl, [ctrl]), proxy(() => this._fontsChanged())).then((renderer) => {
            this.renderer = renderer;
        });
        if (this._video) {
            this.setVideo(this._video);
        }
        else {
            this._ro.observe(this._canvas);
        }
    }
    static _supportsSIMD;
    static _test() {
        if (JASSUB._supportsSIMD != null)
            return;
        try {
            JASSUB._supportsSIMD = WebAssembly.validate(Uint8Array.of(
            // WASM magic number + version 1
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 
            // Type section: 1 type, func () -> v128
            0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 
            // function section 1 function, type index 0
            0x03, 0x02, 0x01, 0x00, 
            // code section 1 body, 0 locals
            0x0a, 0x2b, 0x01, 0x29, 0x00, 
            // v128.const i32x4 0 0 0 0
            0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
            // v128.const i32x4 0 0 0 0
            0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
            // i8x16.relaxed_swizzle relaxed SIMD
            0xfd, 0x80, 0x02, 
            // end
            0x0b));
        }
        catch (e) {
            JASSUB._supportsSIMD = false;
        }
        const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
        if (!(module instanceof WebAssembly.Module) || !(new WebAssembly.Instance(module) instanceof WebAssembly.Instance))
            throw new Error('WASM not supported');
    }
    async resize(forceRepaint = !!this._video?.paused, renderWidth = 0, renderHeight = 0) {
        const videoWidth = this._video?.videoWidth ?? this._videoWidth;
        const videoHeight = this._video?.videoHeight ?? this._videoHeight;
        const videoSize = this._getElementBoundingBox(this._video ?? this._canvas, videoWidth, videoHeight);
        if (!renderWidth || !renderHeight) {
            // || 1 for divide by zero safety
            const widthScale = (this._videoWidth / videoWidth) || 1;
            const heightScale = (this._videoHeight / videoHeight) || 1;
            const { width, height } = this._computeRenderSize(videoSize.width * widthScale, videoSize.height * heightScale);
            renderWidth = Math.round(width);
            renderHeight = Math.round(height);
        }
        if (this._video) {
            this._canvas.style.width = Math.round(videoSize.width) + 'px';
            this._canvas.style.height = Math.round(videoSize.height) + 'px';
            this._canvas.style.top = videoSize.y + 'px';
            this._canvas.style.left = videoSize.x + 'px';
        }
        // The storage size is the video resolution. Do not set it for canvas-only
        // rendering. If it is set to the render size, libass scales blur, borders
        // and shadows by the render size instead of the script resolution
        // (libass issue #591).
        await this.renderer._resizeCanvas(renderWidth, renderHeight, this._video ? (this._videoWidth || renderWidth) : 0, this._video ? (this._videoHeight || renderHeight) : 0);
        if (this._lastDemandTime)
            await this._demandRender(forceRepaint);
    }
    _getElementBoundingBox(el, videoWidth, videoHeight) {
        const { clientWidth, clientHeight, offsetLeft, offsetTop } = el;
        const videoRatio = videoWidth / videoHeight;
        const elementRatio = clientWidth / clientHeight;
        if (elementRatio > videoRatio) {
            videoHeight = clientHeight;
            videoWidth = clientHeight * videoRatio;
        }
        else {
            videoHeight = clientWidth / videoRatio;
            videoWidth = clientWidth;
        }
        return { x: offsetLeft + (clientWidth - videoWidth) / 2, y: offsetTop + (clientHeight - videoHeight) / 2, width: videoWidth, height: videoHeight };
    }
    _computeRenderSize(width = 0, height = 0) {
        if (height <= 0 || width <= 0)
            return { width: 0, height: 0 };
        const scalefactor = this.prescaleFactor <= 0 ? 1.0 : this.prescaleFactor;
        const ratio = self.devicePixelRatio || 1;
        const sgn = scalefactor < 1 ? -1 : 1;
        let newH = height * ratio;
        if (sgn * newH * scalefactor <= sgn * this.prescaleHeightLimit) {
            newH *= scalefactor;
        }
        else if (sgn * newH < sgn * this.prescaleHeightLimit) {
            newH = this.prescaleHeightLimit;
        }
        if (this.maxRenderHeight > 0 && newH > this.maxRenderHeight)
            newH = this.maxRenderHeight;
        width *= newH / height;
        height = newH;
        return { width, height };
    }
    // Fonts were added after rendering began, so what is drawn may have used a fallback.
    // Replaces the default redraw of the last frame.
    onfontschange = null;
    _fontsChanged() {
        if (this.onfontschange)
            return this.onfontschange();
        if (this._lastDemandTime)
            this._demandRender(true);
    }
    async setVideo(target) {
        this._removeListeners();
        this._video = target;
        if (!this._manualPresent)
            this._ro.observe(target);
        if (typeof VideoFrame !== 'undefined') {
            target.addEventListener('loadedmetadata', this._boundUpdateColorSpace);
            this._updateColorSpace({ target });
        }
        await this.ready;
        if (this._manualPresent)
            return;
        this._video.requestVideoFrameCallback((now, data) => this._handleRVFC(data));
    }
    // manualPresent only. `times` are video times; timeOffset is added. See ASSRenderer._renderImages.
    async renderImages(times, width, height, repaint = false) {
        await this.ready;
        const videoWidth = this._video?.videoWidth || width;
        const videoHeight = this._video?.videoHeight || height;
        return await this.renderer._renderImages(times.map(t => t + this.timeOffset), width, height, videoWidth, videoHeight, repaint);
    }
    async _getLocalFont(font, weight = 'regular') {
        // electron by default has all permissions enabled, and it doesn't have perm query
        // if this happens, just send it
        if (navigator.permissions?.query) {
            const { state } = await navigator.permissions.query({ name: 'local-fonts' });
            if (state !== 'granted')
                return;
        }
        for (const data of await self.queryLocalFonts()) {
            const family = data.family.toLowerCase();
            const style = data.style.toLowerCase();
            if (family === font && style === weight) {
                const blob = await data.blob();
                return new Uint8Array(await blob.arrayBuffer());
            }
        }
    }
    _handleRVFC(data) {
        if (this._destroyed)
            return;
        this.manualRender(data);
        this._video.requestVideoFrameCallback((now, data) => this._handleRVFC(data));
    }
    manualRender(data, repaint = false) {
        this._lastDemandTime = data;
        return this._demandRender(repaint);
    }
    async _demandRender(repaint = false) {
        const { mediaTime, width, height } = this._lastDemandTime;
        if (width !== this._videoWidth || height !== this._videoHeight) {
            this._videoWidth = width;
            this._videoHeight = height;
            return await this.resize(repaint);
        }
        if (this.busy) {
            this._skipped = true;
            this.debug?._drop();
            return;
        }
        this.busy = true;
        this._skipped = false;
        this.debug?._startFrame();
        await this.renderer._draw(mediaTime + this.timeOffset, repaint);
        this.debug?._endFrame(this._lastDemandTime);
        this.busy = false;
        if (this._skipped)
            await this._demandRender();
    }
    _boundUpdateColorSpace = this._updateColorSpace.bind(this);
    _updateColorSpace({ target }) {
        this._video.requestVideoFrameCallback(async () => {
            if (this._destroyed || this._video !== target)
                return;
            try {
                const frame = new VideoFrame(this._video);
                const colorSpace = webYCbCrMap[frame.colorSpace.matrix];
                frame.close();
                await this.ready;
                await this.renderer._setColorSpace(colorSpace);
            }
            catch (e) {
                // sources can be tainted
                console.warn(e);
            }
        });
    }
    _removeListeners() {
        this._ro.disconnect();
        this._video?.removeEventListener('loadedmetadata', this._boundUpdateColorSpace);
    }
    async destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._canvas.remove();
        this._removeListeners();
        try {
            await this.ready;
            await this.renderer?.[releaseProxy]();
        }
        finally {
            this._worker.terminate();
        }
    }
}
//# sourceMappingURL=jassub.js.map