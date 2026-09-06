import Renderer from "./renderer"

import Timer from "../timer"

import Resizer, { ResizerBestFit } from "../resizer"

import EffectArt from "../effects/artcnn"
import EffectDeband from "../effects/deband"
import EffectDehalo from "../effects/dehalo"
import EffectLoad from "../effects/load"
import EffectLut3d from "../effects/lut3d"

import Effect from "../effects/_effect"
import { FULLSCREEN_VERTEX, create_fullscreen_pipeline } from "../effects/_fullscreen"
import GrassPlayer from "../grassplayer2"
import SamplerDefault from "../samplers/default"
import SamplerDefaultLinear from "../samplers/defaultlinear"
import SamplerSphere from "../samplers/sphere"

import rvfc_firefox from "./rvfc_firefox"

import JASSUB from "../jassub"
import SubtitlesOctopus from "../subtitles-octopus2"

function create_element(
    tagname: string,
    root: HTMLElement | null = null,
    classes = "",
): HTMLElement {
    const e = document.createElement(tagname)

    if (classes.length > 0) {
        for (const class_name of classes.split(" ")) {
            e.classList.toggle(class_name, true)
        }
    }

    root?.appendChild(e)

    return e
}

export default class RendererWebGPU implements Renderer {
    player

    on_buffers?: (buffers: any) => void
    on_buffer_end?: (end: number) => void
    on_timeupdate?: (t: number) => void

    device: GPUDevice | null = null

    resizer: Resizer | null = null
    #have_frame: boolean = false

    // Frame delivery, from requestVideoFrameCallback metadata. `presentedFrames` counts every
    // frame the browser submitted for composition, so a gap between two callbacks means the
    // compositor moved on past a frame we never drew. "Late" counts the frames we did draw but
    // only after the moment the browser expected them on screen. Both are the numbers that
    // actually correlate with visible judder, unlike a frame counter or an instantaneous fps.
    #frame_metadata: any = null
    #frames_presented = -1
    #frames_dropped = 0
    #frames_late = 0
    #frame_metadata_available = false

    #reset_frame_stats() {
        this.#frames_presented = -1
        this.#frames_dropped = 0
        this.#frames_late = 0
        this.#frames_held = 0
        this.#frame_metadata = null
    }

    #e_video: HTMLVideoElement
    #e_canvas: HTMLCanvasElement
    #e_subtitles: HTMLCanvasElement
    #e_videoinfo_catchup: HTMLElement
    #e_videoinfo_method: HTMLSelectElement

    #loaded
    constructor(player: GrassPlayer, root: HTMLElement, root_settings: HTMLElement) {
        root.innerHTML = `
<canvas class="video" width="1920" height="1080" style="width: 100%; height: 100%; object-fit: contain;"></canvas>
<div class="subtitles"></div>
`

        root_settings.innerHTML = `
<div>
    <div>Stats</div>
    <div class="stats options nogap">
        <div><span>Frame</span><span class="framenumber"></span></div>
        <div><span>Fps</span><span class="fps"></span></div>
        <div><span>Dropped</span><span class="dropped"></span></div>
        <div><span>Late</span><span class="late"></span></div>
        <div><span>Held</span><span class="held"></span></div>
        <div><span>Total time (ms)</span><span class="totaltime"></span></div>
        <div><span>JS (ms)</span><span class="jstime"></span></div>
        <div><span>GPU queue (ms)</span><span class="queuetime"></span></div>
        <div><span>GPU (us)</span><span class="gputime"></span></div>
        <div>Passes (ns): </div>
        <div class="timing"></div>
    </div>
</div>
<div>
    <div>Video</div>
    <div class="videoinfo options">
        <div class="videoinfo-video-container">
            <video controls crossorigin="anonymous"></video>
        </div>
        <div><span>Resolution</span><span class="videoinfo-resolution"></span></div>
        <div><span>Buffered</span><span class="videoinfo-buffered"></span></div>
        <div><span>Catchup</span><span class="videoinfo-catchup"></span></div>
        <div>
            <span>Method</span>
            <select class="videoinfo-method">
                <option>requestVideoFrameCallback</option>
                <option>rVFC firefox polyfill</option>
            </select>
        </div>
    </div>
</div>
<div>
    <div><span>Resizer</span><select class="select-resizers"></select></div>
    <div class="resizer"></div>
</div>
<div>
    <div>Filters</div>
    <div class="filters"></div>
</div>
<div>
    <div><span>Sampler</span><select class="select-sampler"></select></div>
</div>
<div>
    <div><span>Double Buffering</span><input class="chk-double-buffer" type="checkbox"></input></div>
</div>
<div>
    <div><span>Subtitles</span><select class="select-subtitles"></select></div>
</div>
`

        this.player = player
        this.#e_video = root_settings.querySelector("video")!
        this.#e_canvas = root.querySelector("canvas.video")!
        this.#e_subtitles = root.querySelector("div.subtitles")!
        this.#e_videoinfo_catchup = root_settings.querySelector(".videoinfo-catchup")!
        this.#e_videoinfo_method = root_settings.querySelector(".videoinfo-method")!

        {
            const resolution = root_settings.querySelector(".videoinfo-resolution")!
            this.#e_video.addEventListener("loadedmetadata", () => {
                this.on_timeupdate?.(this.current_time())
                resolution.textContent = `${this.#e_video.videoWidth}x${this.#e_video.videoHeight}`
            })
        }

        {
            this.#e_videoinfo_method.addEventListener("change", () => {
                this.player.set_storage(
                    "webgpu-testing-rvfc",
                    this.#e_videoinfo_method.selectedIndex,
                )
                window.navigation.reload()
            })
        }

        // video buffer
        {
            const buffered = root_settings.querySelector(".videoinfo-buffered")!
            this.#e_video.addEventListener("timeupdate", () => {
                this.on_timeupdate?.(this.current_time())
                const end = this.#update_playable()
                buffered.textContent = `${Math.round(end - this.current_time()) || 0} seconds`
            })

            this.#e_video.addEventListener("progress", () => {
                this.on_buffers?.(this.#e_video.buffered)

                const end = this.#update_playable()
                buffered.textContent = `${Math.round(end - this.current_time()) || 0} seconds`
            })
        }

        this.#loaded = this.init(root, root_settings)

        fetch("https://r2tube.grass.moe/fonts.json")
            .then(res => res.json())
            .then(fonts => {
                for (const key of Object.keys(fonts)) {
                    fonts[key] = fonts[key].map((f: any) => f)
                }
                this.#fonts = fonts
                this.set_subtitles(this.#current_subtitles)
                console.log("fonts:loaded")
            })
            .catch(err => {
                console.log("fonts:error fetching", err)
            })
    }

    #fonts: Record<string, string[]> = {}
    #sub_renderer: SubtitlesOctopus | JASSUB | null = null
    #current_subtitles: string | null = null
    async set_subtitles(subtitles: string | null) {
        this.#current_subtitles = subtitles

        this.#sub_renderer?.destroy()
        this.#sub_renderer = null

        while (this.#e_subtitles.firstChild) {
            this.#e_subtitles.removeChild(this.#e_subtitles.firstChild)
        }

        if (subtitles == null || subtitles.length == 0) return

        if (this.player.get_storage("subtitle-renderer") == "SubtitlesOctopus") {
            this.#sub_renderer = new SubtitlesOctopus({
                video: this.#e_video,
                canvasParent: this.#e_subtitles,
                proxyCanvas: this.#e_canvas,
                subUrl: subtitles,
                availableFonts: this.#fonts,
                workerUrl: "/includes/subtitles-octopus-worker.js",
            })
        } else {
            let fonts: Record<string, string> = {}
            for (const k in this.#fonts) {
                for (const v of this.#fonts[k]) {
                    fonts[k] = v
                }
            }
            fonts["liberation sans"] = "/includes/default.woff2"

            this.#sub_renderer = new JASSUB({
                video: this.#e_video,
                canvasParent: this.#e_subtitles,
                proxy: this.#e_canvas,
                subUrl: subtitles,
                workerUrl: "/includes/jassub/worker.js",
                wasmUrl: "/includes/jassub/jassub-worker.wasm",
                modernWasmUrl: "/includes/jassub/jassub-worker-modern.wasm",
                fonts: [
                    "https://r2tube.grass.moe/fonts/vesta-bold.otf",
                    "https://r2tube.grass.moe/fonts/Roboto-Medium.ttf",
                ],
                availableFonts: fonts,
            })

            await this.#sub_renderer.ready
        }
    }

    #update_playable(): number {
        for (let i = 0; i < this.#e_video.buffered.length; i++) {
            const start = this.#e_video.buffered.start(i)
            const end = this.#e_video.buffered.end(i)
            if ((start < this.current_time() || start < 1) && end > this.current_time()) {
                if (this.on_buffer_end) {
                    this.on_buffer_end(end)
                }

                return end
            }
        }

        return 0
    }

    // Deferred presentation ("double buffering"): the filter chain renders into one of these
    // two canvas-sized images, and the *next* animation frame copies the finished one into the
    // swap chain in a separate, earlier submit. The compositor then only ever waits on a plain
    // full-screen copy instead of on the whole chain, which is what keeps pacing even when a
    // frame's filtering happens to overrun. It costs exactly one frame of extra latency.
    #present_pipeline: GPURenderPipeline | null = null
    #present_textures: GPUTexture[] = []
    #present_views: GPUTextureView[] = []
    #present_bindgroups: GPUBindGroup[] = []
    #present_size: [number, number] = [0, 0]
    #present_next = 0
    #present_pending = -1
    double_buffering = false

    // ---- presentation clock -------------------------------------------------------------
    //
    // Presenting a buffered frame at whichever animation frame happens to come next inherits all
    // of that callback's jitter, and quantises every frame to "the next rAF" regardless of when it
    // was actually due. Instead each rendered frame gets a wall-clock deadline derived from its
    // own mediaTime, and it is held until the refresh nearest that deadline.
    //
    // Because consecutive deadlines are separated by the exact media delta (41.708 ms for 23.976
    // fps) rather than by however rAF happened to fire, a 24 fps source on a 60 Hz display settles
    // into a true 3:2 pattern instead of drifting between 3:2 and 2:3.

    // Lead the schedule keeps, in refresh intervals. A frame rendered during one callback can
    // first reach the screen two refreshes later, so anything above 2 is slack the scheduler can
    // spend holding a frame back to land it on the right vsync.
    //
    // That slack is exactly the tolerance for a late render, so it is also exactly the latency
    // cost - which is why it adapts rather than sitting at the worst case. On a machine that is
    // hitting every vsync there is nothing to absorb and it settles at the floor; missed callbacks
    // raise it quickly, and it bleeds back down over about ten seconds of clean frames.
    static #LEAD_MIN = 2.5
    static #LEAD_MAX = 3.5

    // Hard ceiling on how long any one frame may wait, as a duration rather than a callback
    // count. At 60 Hz this works out to a single hold, which is exactly what the 3:2 cadence
    // needs and bounds the whole path at three refreshes. Counting callbacks instead would make
    // the ceiling shrink with the refresh interval: on a 240 Hz display one hold is only 4 ms,
    // far too tight to reach the right vsync, and measurably worse than not scheduling at all.
    static #MAX_HOLD_MS = 17

    #lead = RendererWebGPU.#LEAD_MIN
    #present_holds = 0

    #refresh_ms = 1000 / 60
    #refresh_samples: number[] = []
    #last_raf = 0

    #sched_media = 0
    #sched_due = 0
    #sched_valid = false
    #frames_held = 0

    #reset_present_clock() {
        this.#sched_valid = false
        this.#present_pending = -1
    }

    /**
     * Rolling estimate of the display refresh interval, as the modal gap between callbacks.
     *
     * Deltas are quantised to the display clock, and a missed callback contributes a whole
     * multiple of it. The mode picks out the single-refresh cluster and ignores the multiples,
     * where a mean or median is dragged up by them and a percentile is dragged down by any wobble
     * on the timestamps.
     */
    #update_refresh(t: number) {
        const dt = t - this.#last_raf
        this.#last_raf = t
        if (dt < 1 || dt > 200) return

        const samples = this.#refresh_samples
        samples.push(dt)
        if (samples.length > 240) samples.shift()
        if (samples.length < 30) return

        const BUCKET = 0.5
        const counts = new Map<number, number>()
        let best = -1
        let best_count = 0
        for (const sample of samples) {
            const bucket = Math.round(sample / BUCKET)
            const count = (counts.get(bucket) || 0) + 1
            counts.set(bucket, count)
            if (count > best_count) {
                best_count = count
                best = bucket
            }
        }

        // Average the winning bucket and its neighbours so the result is not itself quantised.
        let sum = 0
        let n = 0
        for (const sample of samples) {
            if (Math.abs(Math.round(sample / BUCKET) - best) <= 1) {
                sum += sample
                n++
            }
        }

        if (n > 0) this.#refresh_ms = Math.min(40, Math.max(4, sum / n))

        // A gap of more than one refresh means a callback was missed: the render that would have
        // happened in it is now late, and only lead above 2 can keep that off the screen.
        const skipped = Math.round(dt / this.#refresh_ms) - 1
        if (skipped > 0) {
            this.#lead = Math.min(
                RendererWebGPU.#LEAD_MAX,
                this.#lead + 0.25 * Math.min(skipped, 4),
            )
        } else {
            this.#lead += (RendererWebGPU.#LEAD_MIN - this.#lead) * 0.002
        }
    }

    /** Give the frame about to be rendered a deadline, advancing the schedule by its media delta. */
    #schedule_present(t: number, metadata: any) {
        if (metadata == null) {
            // No metadata (Firefox polyfill): fall back to presenting at the next opportunity.
            this.#sched_valid = false
            return
        }

        const refresh = this.#refresh_ms
        const lead = refresh * this.#lead
        const media = metadata.mediaTime
        const rate = this.#e_video.playbackRate || 1

        if (this.#sched_valid) {
            const delta = ((media - this.#sched_media) * 1000) / rate

            if (delta > 0 && delta < 1000) {
                this.#sched_due += delta

                const slack = this.#sched_due - t
                const error = slack - lead

                if (slack < -refresh || slack > 250) {
                    // Seek, stall or a long tab throttle: the mapping is meaningless now.
                    this.#sched_due = t + lead
                } else if (Math.abs(error) > refresh) {
                    // Only correct once the schedule has wandered more than a whole refresh, and
                    // then only slightly. Chasing the per-frame error would re-anchor the deadline
                    // to when frames happen to arrive, which is exactly the jitter being removed:
                    // the deadlines have to keep advancing by the media delta and nothing else.
                    this.#sched_due -= error * 0.05
                }
            } else {
                this.#sched_due = t + lead
            }
        } else {
            this.#sched_due = t + lead
            this.#sched_valid = true
        }

        this.#sched_media = media
    }

    /** Whether the pending frame belongs on the screen at the refresh this callback feeds. */
    #present_is_due(t: number) {
        if (!this.#sched_valid) return true

        // Content drawn in this callback reaches the screen at the next vsync; present at the
        // refresh nearest the deadline rather than the first one at or after it.
        return t + this.#refresh_ms >= this.#sched_due - this.#refresh_ms * 0.5
    }

    #present_target = {
        view: null as GPUTextureView | null,
        loadOp: "clear" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
        clearValue: [0, 0, 0, 1],
    }
    #present_desc: GPURenderPassDescriptor = {
        label: "present",
        colorAttachments: [this.#present_target as any],
    }

    /** Allocate (or reallocate) the deferred-present images for the current canvas size. */
    #ensure_present_targets(w: number, h: number): boolean {
        if (this.#present_size[0] == w && this.#present_size[1] == h) {
            return this.#present_views.length == 2
        }

        const old = this.#present_textures
        if (old.length) {
            this.device!.queue.onSubmittedWorkDone().then(() => old.forEach(t => t.destroy()))
        }

        this.#present_textures = []
        this.#present_views = []
        this.#present_bindgroups = []
        this.#present_pending = -1
        this.#sched_valid = false
        this.#present_next = 0
        this.#present_size = [w, h]

        if (this.#present_pipeline == null) return false

        for (let i = 0; i < 2; i++) {
            const texture = this.device!.createTexture({
                label: `present ${i}`,
                size: [w, h],
                format: this.canvas_format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            })
            const view = texture.createView()
            this.#present_textures.push(texture)
            this.#present_views.push(view)
            this.#present_bindgroups.push(
                this.device!.createBindGroup({
                    layout: this.#present_pipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: view }],
                }),
            )
        }

        return true
    }

    #clear?: () => void
    #sampler: any
    #effects: Effect[] = []
    #textures: Record<string, GPUTexture[]> = {}
    #texture_views: Record<string, GPUTextureView[]> = {}

    /** Format the swap chain is configured with. Render pipelines that target the canvas must match it. */
    canvas_format: GPUTextureFormat = "rgba8unorm"
    /** Whether the device supports timestamp-query, i.e. whether the GPU timings in the stats panel work. */
    timestamps = false
    /** Largest workgroup storage (in bytes) a compute shader may declare on this device. */
    workgroup_storage = 16384

    #fallback_to_basic(reason: string) {
        console.error(`webgpu: ${reason}`)
        // The next load comes up on the basic renderer without permanently changing the user's choice.
        this.player.set_storage("webgpu-disable-temporary", 1)
        this.player.set_storage("renderer", 1)
        window.location.reload()
    }

    async init(root: HTMLElement, root_settings: HTMLElement) {
        const adapter = await navigator.gpu
            ?.requestAdapter({ powerPreference: "high-performance" })
            .catch(() => null)

        if (!adapter) {
            this.#fallback_to_basic("no adapter")
            return
        }

        // Everything below is optional: ask for what we can use, but never let a missing feature or
        // limit take down the whole renderer. ArtCNN needs 20736 bytes of workgroup storage and
        // dehalo scales its tile to whatever it gets; both degrade instead of failing.
        const requiredFeatures: GPUFeatureName[] = []
        if (adapter.features.has("timestamp-query")) requiredFeatures.push("timestamp-query")

        const wanted_storage = Math.min(32768, adapter.limits.maxComputeWorkgroupStorageSize)

        let device = await adapter
            .requestDevice({
                requiredFeatures,
                requiredLimits: { maxComputeWorkgroupStorageSize: wanted_storage },
            })
            .catch(() => null)

        if (!device) device = await adapter.requestDevice().catch(() => null)

        if (!device) {
            this.#fallback_to_basic("failed to get device")
            return
        }

        this.device = device
        this.timestamps = device.features.has("timestamp-query")
        this.workgroup_storage = device.limits.maxComputeWorkgroupStorageSize

        device.lost.then(info => {
            // "destroyed" means we asked for it (page teardown), anything else is a real loss.
            if (info.reason == "destroyed") return
            this.#fallback_to_basic(`device lost: ${info.message}`)
        })

        device.onuncapturederror = e => console.error("webgpu:", e.error)

        console.log("gpu loaded")

        // Use whatever format the compositor actually wants (bgra8unorm on most desktop platforms).
        // Forcing rgba8unorm made the browser convert the swap chain every frame, and required
        // STORAGE_BINDING on the canvas, which is not universally available. Everything now draws
        // into the canvas through a render pass, so RENDER_ATTACHMENT (the default) is enough.
        this.canvas_format = navigator.gpu.getPreferredCanvasFormat()

        const context = this.#e_canvas.getContext("webgpu") as GPUCanvasContext
        context.configure({
            device: device,
            format: this.canvas_format,
            colorSpace: "srgb",
            alphaMode: "opaque",
        })

        // if (this.player.get_storage("webgpu-features-tested") == null) {
        //     const resp = await this.#test_timing(device)
        //     if (resp == "success") {
        //         this.player.set_storage("webgpu-features-tested", "1")
        //         return
        //     }
        //     if (!confirm(`${resp} Fall back to basic renderer?`)) {
        //         if (confirm("Always ignore?")) {
        //             this.player.set_storage("webgpu-features-tested", "1")
        //             return
        //         }
        //         return
        //     }

        //     this.player.set_storage("renderer", 1)
        //     window.location.reload()
        // }

        if (this.player.get_storage("webgpu-testing-rvfc") == null) {
            const res = await this.#test_rvfc()
            if (res == "success") {
                this.player.set_storage("webgpu-testing-rvfc", 0)
            } else {
                if (confirm(`${res} Use firefox polyfill?`)) {
                    this.player.set_storage("webgpu-testing-rvfc", 1)
                }
            }
        }

        this.#clear = () => {
            const commandEncoder = device.createCommandEncoder()
            const textureView = context.getCurrentTexture().createView()

            const renderPassDescriptor: GPURenderPassDescriptor = {
                colorAttachments: [
                    {
                        view: textureView,
                        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                        loadOp: "clear",
                        storeOp: "store",
                    },
                ],
            }

            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
            passEncoder.end()
            device.queue.submit([commandEncoder.finish()])
        }

        // Present pipeline for the deferred path: a 1:1 copy, so textureLoad rather than a
        // sampler - the source and the swap chain always have identical dimensions.
        {
            const module = device.createShaderModule({
                label: "present",
                code: /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
${FULLSCREEN_VERTEX}
@fragment
fn fs_main(in: FsVertexOutput) -> @location(0) vec4<f32> {
    return textureLoad(src, vec2<i32>(in.pos.xy), 0);
}`,
            })

            this.#present_pipeline = create_fullscreen_pipeline(
                device,
                module,
                this.canvas_format,
                "present",
            )
        }

        // Create resizer
        {
            const options = [
                new ResizerBestFit(device, root, this.#e_video, this.#e_canvas),
                // new ResizerStretch(device, root, this.#e_video, this.#e_canvas),
            ]

            const select: HTMLSelectElement = root_settings.querySelector(".select-resizers")!
            options.forEach(e => {
                create_element("option", select).textContent = e.constructor.name
            })

            select.addEventListener("change", () => {
                console.log(select.selectedIndex)
            })

            this.resizer = options[0]

            const observer = new ResizeObserver(() => this.resize())
            observer.observe(root)

            const div = root_settings.querySelector(".resizer")!
            const el = document.createElement("div")
            el.className = "options"
            div.appendChild(el)
            this.resizer.create_settings(el)
        }

        // Create effects
        {
            this.#effects = [
                new EffectLoad(this),
                new EffectDeband(this),
                new EffectLut3d(this),
                new EffectDehalo(this),
                new EffectArt(this),
            ]

            // ArtCNN's conv passes stage an 18x18x4 vec4 tile in workgroup storage. Without room
            // for it the pipelines would fail to compile, so drop the effect rather than the
            // renderer.
            if (this.workgroup_storage < EffectArt.workgroup_storage_needed) {
                console.warn(
                    `webgpu: workgroup storage ${this.workgroup_storage} < ` +
                    `${EffectArt.workgroup_storage_needed}, ArtCNN unavailable`,
                )
                this.#effects = this.#effects.filter(e => !(e instanceof EffectArt))
            }

            this.#effects.forEach(e => {
                e.load()
            })

            const div = root_settings.querySelector(".filters")!
            this.#effects.forEach(e => {
                e.on_update = () => {
                    this.#have_frame = true
                }

                const el = document.createElement("div")
                div.appendChild(el)

                const title = document.createElement("div")
                title.className = "title"
                el.appendChild(title)

                if (!e.force) {
                    const check = document.createElement("input")
                    title.appendChild(check)
                    check.type = "checkbox"
                    check.checked = e.enabled
                    check.addEventListener("input", () => {
                        e.enabled = check.checked

                        if (e.enabled && !e.initialized) {
                            try {
                                e.init()
                            } catch (err) {
                                console.error(`webgpu: ${e.constructor.name}.init failed`, err)
                                e.enabled = false
                                check.checked = false
                                return
                            }
                        }

                        if (e.enabled) {
                            e.on_enable()
                        } else {
                            e.on_disable()
                        }

                        this.#have_frame = true
                    })
                }

                const title_text = create_element("span", title)
                title_text.textContent = e.constructor.name

                const body = create_element("div", el, "options")
                e.create_settings(body)
            })
        }

        // Create sampler
        {
            const options = [
                new SamplerDefaultLinear(this),
                new SamplerDefault(this),
                new SamplerSphere(this),
            ]

            const select: HTMLSelectElement = root_settings.querySelector(".select-sampler")!
            options.forEach(e => {
                const option = document.createElement("option")
                option.textContent = e.constructor.name
                select.appendChild(option)
            })

            // const div = root_settings.querySelector(".sampler")

            select.addEventListener("change", () => {
                // while (div.firstChild) {
                //     div.removeChild(div.firstChild)
                // }
                // options[select.selectedIndex].create_settings(div)
                options[select.selectedIndex].init()
                this.#sampler = options[select.selectedIndex]
                this.#sampler.reset()
                this.#have_frame = true
            })

            this.#sampler = options[0]
            // this.#sampler.create_settings(div)
            this.#sampler.init()
        }

        // Double buffering
        {
            const check: HTMLInputElement = root_settings.querySelector(".chk-double-buffer")!

            const apply = () => {
                this.double_buffering = check.checked
                // Anything already rendered ahead belongs to the other mode.
                this.#reset_present_clock()
                this.#have_frame = true
            }

            check.addEventListener("input", () => {
                this.player.set_storage("webgpu-double-buffer", check.checked ? 1 : 0)
                apply()
            })

            // Default on: the steadier pacing is worth one frame of latency for video playback.
            const stored = this.player.get_storage("webgpu-double-buffer")
            check.checked = stored == null ? false : stored == "1"
            apply()
        }

        // Create subtitles option
        {
            const options = ["JASSUB", "SubtitlesOctopus"]
            const select: HTMLSelectElement = root_settings.querySelector(".select-subtitles")!
            options.forEach(e => {
                const option = document.createElement("option")
                option.textContent = e
                select.appendChild(option)
            })
            select.addEventListener("change", () => {
                this.player.set_storage("subtitle-renderer", options[select.selectedIndex])
                this.set_subtitles(this.#current_subtitles)
            })
            select.selectedIndex = options.indexOf(
                this.player.get_storage("subtitle-renderer") || "JASSUB",
            )
        }

        this.#effects.forEach(e => {
            if (!e.enabled) return
            try {
                e.init()
            } catch (err) {
                // A single bad pipeline should not take out every effect after it in the list.
                console.error(`webgpu: ${e.constructor.name}.init failed`, err)
                e.enabled = false
            }
        })

        const timer = new Timer(device, this.timestamps)

        const framenumber = root_settings.querySelector(".framenumber")!
        const txt_fps = root_settings.querySelector(".fps")!
        const txt_dropped = root_settings.querySelector(".dropped")!
        const txt_late = root_settings.querySelector(".late")!
        const txt_held = root_settings.querySelector(".held")!
        const totaltime = root_settings.querySelector(".totaltime")!
        const jstime = root_settings.querySelector(".jstime")!
        const queuetime = root_settings.querySelector(".queuetime")!
        const gputime = root_settings.querySelector(".gputime")!
        const timing = root_settings.querySelector(".timing")!

        // The stats block is the only consumer of the GPU timings and of the per-frame DOM writes,
        // and the panel it lives in is hidden most of the time. Watch it so a normal playing frame
        // costs neither a query-set resolve/readback nor five textContent writes.
        let stats_visible = false
        new IntersectionObserver(entries => {
            stats_visible = entries[entries.length - 1].isIntersecting
            timer.enabled = stats_visible && this.timestamps
        }).observe(root_settings.querySelector(".stats")!)

        let frame_n = 0
        let last_t = 0

        if (this.player.get_storage("webgpu-testing-rvfc") == "1") {
            // The polyfill only reports that *something* changed, with no metadata to go on.
            this.#e_videoinfo_method.selectedIndex = 1
            this.#frame_metadata_available = false
            rvfc_firefox(this.#e_video, () => {
                this.#have_frame = true
            })
        } else {
            this.#e_videoinfo_method.selectedIndex = 0
            this.#frame_metadata_available = true

            const tz = (now: number, metadata: any) => {
                // Re-register first so a slow frame cannot cost us the next callback.
                this.#e_video.requestVideoFrameCallback(tz)
                this.#have_frame = true
                this.#frame_metadata = metadata

                if (this.#frames_presented >= 0) {
                    const skipped = metadata.presentedFrames - this.#frames_presented - 1
                    if (skipped > 0) this.#frames_dropped += skipped
                }
                this.#frames_presented = metadata.presentedFrames
            }
            this.#e_video.requestVideoFrameCallback(tz)
        }

        // Reused across frames so the hot path does not allocate per frame.
        const canvas_res: [number, number] = [0, 0]

        const present_frame = () => {
            const present = device.createCommandEncoder()
            this.#present_target.view = context.getCurrentTexture().createView()
            const pass = present.beginRenderPass(this.#present_desc)
            pass.setPipeline(this.#present_pipeline!)
            pass.setBindGroup(0, this.#present_bindgroups[this.#present_pending])
            pass.draw(3)
            pass.end()
            device.queue.submit([present.finish()])
            this.#present_pending = -1
        }

        const render = (t: number) => {
            requestAnimationFrame(render)
            this.#update_refresh(t)
            if (this.#e_video.videoWidth == 0) return

            // We are using requestAnimationFrame in a busy loop to keep the gpu from going to sleep
            if (!this.#have_frame && !this.double_buffering) {
                device.queue.submit([device.createCommandEncoder().finish()])
                return
            }

            // Deferred presentation: hand the compositor the frame finished last time round, in
            // its own submit, before this frame's chain is queued behind it.
            const deferred =
                this.double_buffering &&
                this.#ensure_present_targets(this.#e_canvas.width, this.#e_canvas.height)

            if (deferred && this.#present_pending >= 0) {
                const max_holds = Math.max(
                    1,
                    Math.floor(RendererWebGPU.#MAX_HOLD_MS / this.#refresh_ms),
                )

                if (this.#present_is_due(t) || this.#present_holds >= max_holds) {
                    present_frame()
                } else {
                    this.#present_holds++
                    this.#frames_held++
                }
            }

            if (!this.#have_frame) {
                // Keep the busy submit going so the GPU does not clock down between video frames.
                device.queue.submit([device.createCommandEncoder().finish()])
                return
            }

            const video_time = this.current_time()

            const t0 = performance.now()

            let texture_video: GPUExternalTexture
            try {
                texture_video = device.importExternalTexture({ source: this.#e_video })
            } catch (e) {
                // The frame is not importable yet (seek in flight, decoder hiccup). Leave the flag
                // set so the next animation frame retries instead of stalling until the next rVFC.
                return
            }

            this.#have_frame = false

            // expectedDisplayTime shares a timebase with the animation frame timestamp, so this
            // is "the browser wanted this frame on screen before we even started drawing it".
            const metadata = this.#frame_metadata
            this.#frame_metadata = null
            if (metadata != null && t > metadata.expectedDisplayTime) this.#frames_late++

            if (deferred) {
                // A frame is still waiting and a newer one is ready: show it now rather than
                // overwrite the slot it is holding. Reaching this means the schedule is running
                // behind the source, so pull the deadline back with it.
                if (this.#present_pending >= 0) {
                    present_frame()
                    this.#sched_due = Math.min(this.#sched_due, t + this.#refresh_ms)
                }

                this.#schedule_present(t, metadata)
            }

            const encoder = device.createCommandEncoder()

            canvas_res[0] = this.#e_canvas.width
            canvas_res[1] = this.#e_canvas.height

            const texture_canvas = deferred
                ? this.#present_views[this.#present_next]
                : context.getCurrentTexture().createView()

            timer.start(encoder)

            let last_tex: any = texture_video
            let last_tex_res: [number, number] = [
                this.#e_video.videoWidth,
                this.#e_video.videoHeight,
            ]

            const effects = this.#effects
            for (let i = 0; i < effects.length; i++) {
                const e = effects[i]
                if (!e.enabled) continue
                const out = timer.run(e, video_time, last_tex, last_tex_res)
                last_tex = out[0]
                last_tex_res = out[1]
            }

            timer.run(this.#sampler, video_time, last_tex, last_tex_res, texture_canvas, canvas_res)

            timer.finish()

            const t2 = performance.now()
            device.queue.submit([encoder.finish()])

            if (deferred) {
                this.#present_pending = this.#present_next
                this.#present_next ^= 1
                this.#present_holds = 0
            }

            frame_n++

            // Everything below only feeds the stats panel.
            if (!stats_visible) {
                last_t = t
                return
            }

            if (timer.enabled) {
                timer
                    .results()
                    .then(({ sum, passes }) => {
                        let txt = ""
                        for (let i = 0; i < passes.length; i++) {
                            txt += `${i} ${passes[i][0]}: ${passes[i][1]}` + "\n"
                        }

                        timing.textContent = txt
                        gputime.textContent = (sum / 1000).toFixed(2)
                    })
                    .catch(() => { })
            }

            device.queue.onSubmittedWorkDone().then(() => {
                const t3 = performance.now()
                totaltime.textContent = (t3 - t0).toFixed(4)
                queuetime.textContent = (t3 - t2).toFixed(4)
            })

            if (this.#frame_metadata_available) {
                txt_dropped.textContent = this.#frames_dropped.toString()
                txt_late.textContent = this.#frames_late.toString()
            } else {
                txt_dropped.textContent = "n/a"
                txt_late.textContent = "n/a"
            }
            txt_held.textContent = this.double_buffering
                ? `${this.#frames_held} @ ${this.#refresh_ms.toFixed(2)}ms, lead ${(
                    this.#lead * this.#refresh_ms
                ).toFixed(1)}ms`
                : "off"

            const t1 = performance.now()
            jstime.textContent = (t1 - t0).toFixed(4)
            framenumber.textContent = frame_n.toString()
            txt_fps.textContent = (1000 / (t - last_t)).toFixed(4)
            last_t = t
        }
        requestAnimationFrame(render)
    }

    async #test_rvfc() {
        console.log("Testing rvfc")

        const timings: number[] = await new Promise(async resolve => {
            const video = document.createElement("video")
            video.crossOrigin = "anonymous"

            video.onended = () => {
                let time: number | null = null
                let timings: number[] = []
                const rvfc = () => {
                    video.requestVideoFrameCallback(rvfc)
                    const t = performance.now()
                    if (time == null) {
                        time = t
                    } else {
                        console.log(t - time)
                        timings.push(t - time)
                        time = t
                    }
                }

                video.requestVideoFrameCallback(rvfc)

                video.onended = () => {
                    timings.sort((a, b) => a - b)
                    resolve(timings)
                }

                video.play()
            }

            video.muted = true
            video.src = "/includes/50fps.mp4"
            video.play()
        })

        const dropped_frames = 25 - timings.length
        const median = timings[Math.floor(timings.length / 2)]

        console.log("Dropped frames", dropped_frames)
        console.log("Median", median)

        if (dropped_frames > 10) {
            return "Too many dropped frames."
        }

        return "success"
    }

    async #test_timing(device: GPUDevice) {
        console.log("Testing webgpu timing")

        const lowest: number = await new Promise(async resolve => {
            let lowest = Number.MAX_VALUE

            // warmup
            {
                const commandEncoder = device.createCommandEncoder()
                device.queue.submit([commandEncoder.finish()])
                await device.queue.onSubmittedWorkDone()
            }

            for (let i = 0; i < 5; i++) {
                const commandEncoder = device.createCommandEncoder()
                const a = performance.now()
                device.queue.submit([commandEncoder.finish()])
                await device.queue.onSubmittedWorkDone().then(() => {
                    const b = performance.now()
                    console.log(b - a)
                    lowest = Math.min(lowest, b - a)
                })
            }

            resolve(lowest)
        })

        console.log("Lowest", lowest)

        if (lowest > 80) {
            return "WebGPU timer bug detected."
        }

        return "success"
    }

    get_texture(dims: [number, number], not: GPUTextureView[] = []): GPUTextureView {
        const id = `${dims[0]}x${dims[1]}`
        const pool = this.#texture_views[id]
        if (pool !== undefined) {
            for (let i = 0; i < pool.length; i++) {
                if (not.indexOf(pool[i]) < 0) return pool[i]
            }
        }

        console.log(`Create texture ${dims}`)

        const texture = this.device!.createTexture({
            label: `pool ${id} #${pool ? pool.length : 0}`,
            size: dims,
            format: "rgba16float",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.RENDER_ATTACHMENT,
        })
        const view = texture.createView()

        if (pool === undefined) {
            this.#textures[id] = []
            this.#texture_views[id] = []
        }

        this.#textures[id].push(texture)
        this.#texture_views[id].push(view)

        return view
    }

    /**
     * Drop the intermediate texture pool. The old textures are still referenced by work already in
     * the queue, so they are only freed once that has retired; new frames pick up fresh views and
     * every effect rebuilds its bind groups because the view identity changed.
     */
    #reset_textures() {
        const old: GPUTexture[] = []
        for (const id in this.#textures) old.push(...this.#textures[id])

        this.#textures = {}
        this.#texture_views = {}

        if (old.length == 0) return

        this.device?.queue.onSubmittedWorkDone().then(() => {
            for (const texture of old) texture.destroy()
        })
    }

    resize() {
        const w = this.#e_canvas.width
        const h = this.#e_canvas.height

        this.resizer!.resize()

        // ResizeObserver fires for changes that do not move the canvas (and for every intermediate
        // size while a window is dragged). Reassigning width/height reallocates the swap chain, so
        // only redraw when something actually changed.
        if (this.#e_canvas.width == w && this.#e_canvas.height == h) return

        this.#have_frame = true
    }

    reload() {
        this.#e_video.requestVideoFrameCallback(async () => {
            await this.#loaded

            this.#reset_textures()

            this.resize()
            this.#have_frame = true
        })
    }

    set_video(video: string | null, subtitles: string | null) {
        this.#e_video.src = video || ""
        this.#reset_frame_stats()
        this.#reset_present_clock()
        this.set_playing(false)
        // Anything already rendered belongs to the previous video.
        this.#present_pending = -1
        this.#clear?.()

        this.set_subtitles(subtitles)
    }

    set_volume(v: number) {
        this.#e_video.volume = v
    }

    set_captions(b: boolean) {
        this.#e_subtitles.style.display = b ? "" : "none"
    }

    playing() {
        return !this.#e_video.paused
    }

    duration() {
        return this.#e_video.duration || 0
    }

    #speed = 1
    set_speed(s: number) {
        this.#speed = s
        this.#set_speed(s)
    }

    #set_speed(s: number) {
        this.#e_video.playbackRate = s
    }

    set_playing(playing: boolean) {
        if (this.playing() == playing) return

        this.#catchup_done = false

        if (playing) {
            if (this.current_time() >= this.duration()) return
            this.#e_video.play()
        } else {
            this.#e_video.pause()
        }
    }

    current_time() {
        return this.#e_video.currentTime
    }

    seek(t: number, final = false) {
        this.#catchup_done = false

        this.#e_video.currentTime = t
    }

    #catchup_done = false
    #catchup_target: number = 0
    #catchup_target_time: number = 0
    #catchup_timeout: any = null
    #catchup_interval: any = null
    set_catchup(target: number, time: number) {
        if (this.#catchup_done) return
        if (!this.playing()) return

        clearInterval(this.#catchup_interval)
        clearTimeout(this.#catchup_timeout)

        this.#catchup_target = target
        this.#catchup_target_time = time
        this.#catchup_timeout = setTimeout(() => {
            this.#catchup_interval = setInterval(() => this.#run_catchup(), 20)
        }, 200)
    }

    #run_catchup() {
        if (this.#catchup_target == null || !this.playing()) return
        const elapsed = (performance.now() - this.#catchup_target_time) / 1000
        const dist = this.#catchup_target + elapsed - this.current_time()

        const dir = dist > 0 ? 1 : -1
        let catchup_mul = 1 + dir * 0.1

        if (Math.abs(dist) < 0.1) {
            this.#catchup_done = true
            catchup_mul = 1
            clearInterval(this.#catchup_interval)
        }

        this.#set_speed(this.#speed * catchup_mul)

        this.#e_videoinfo_catchup.textContent = `${dist.toFixed(5)} ${catchup_mul.toFixed(5)}x`
    }

    set_muted(b: boolean) {
        this.#e_video.muted = b
    }
}
