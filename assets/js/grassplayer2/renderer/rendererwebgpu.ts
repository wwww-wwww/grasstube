import Renderer from "./renderer"

import Timer from "../timer"

import Resizer, { ResizerBestFit } from "../resizer"

import EffectArt from "../effects/artcnn"
import EffectDeband from "../effects/deband"
import EffectDehalo from "../effects/dehalo"
import EffectLoad from "../effects/load"
import EffectLut3d from "../effects/lut3d"

import Effect from "../effects/_effect"
import GrassPlayer from "../grassplayer2"
import SamplerDefault from "../samplers/default"
import SamplerDefaultLinear from "../samplers/defaultlinear"
import SamplerSphere from "../samplers/sphere"

import rvfc_firefox from "./rvfc_firefox"
import SubtitleOverlay from "./subtitle_overlay"

import JASSUB from "../jassub"

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
        this.#frame_metadata = null
    }

    #e_video: HTMLVideoElement
    #e_canvas: HTMLCanvasElement
    #e_videoinfo_catchup: HTMLElement
    #e_videoinfo_method: HTMLSelectElement

    #loaded
    constructor(player: GrassPlayer, root: HTMLElement, root_settings: HTMLElement) {
        root.innerHTML = `
<canvas class="video" width="1920" height="1080" style="width: 100%; height: 100%; object-fit: contain;"></canvas>
`

        root_settings.innerHTML = `
<div>
    <div>Stats</div>
    <div class="stats options nogap">
        <div><span>Frame</span><span class="framenumber"></span></div>
        <div><span>Fps</span><span class="fps"></span></div>
        <div><span>Dropped</span><span class="dropped"></span></div>
        <div><span>Late</span><span class="late"></span></div>
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
`

        this.player = player
        this.#e_video = root_settings.querySelector("video")!
        this.#e_canvas = root.querySelector("canvas.video")!
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

        // set_subtitles waits on this so JASSUB starts once, with the full font list.
        this.#fonts_ready = fetch("https://r2tube.grass.moe/fonts.json")
            .then(res => res.json())
            .then(fonts => {
                this.#fonts = fonts
                console.log("fonts:loaded")
            })
            .catch(err => {
                console.log("fonts:error fetching", err)
            })
    }

    #fonts: Record<string, string[]> = {}
    #fonts_ready: Promise<void>
    #sub_renderer: JASSUB | null = null
    #current_subtitles: string | null = null
    #subtitles: SubtitleOverlay | null = null
    #captions = true
    async set_subtitles(subtitles: string | null) {
        this.#current_subtitles = subtitles

        this.#subtitles?.set_jassub(null)
        // Rejects if it failed to start.
        this.#sub_renderer?.destroy().catch(() => {})
        this.#sub_renderer = null
        this.#have_frame = true

        if (subtitles == null || subtitles.length == 0) return

        await this.#fonts_ready
        // Superseded while waiting.
        if (this.#current_subtitles !== subtitles || this.#sub_renderer != null) return

        // Whole families; the worker loads every face.
        const fonts: Record<string, string | string[]> = {
            ...this.#fonts,
            "liberation sans": "/includes/default.woff2",
        }

        const jassub = new JASSUB({
            video: this.#e_video,
            manualPresent: true,
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

        this.#sub_renderer = jassub
        this.#subtitles?.set_jassub(jassub)
        // Paused, nothing else requests this frame.
        this.#have_frame = true

        try {
            await jassub.ready
        } catch (e) {
            console.error("subtitles: JASSUB failed to start", e)
            if (this.#sub_renderer === jassub) {
                this.#subtitles?.set_jassub(null)
                this.#sub_renderer = null
            }
            jassub.destroy().catch(() => {})
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

    #media_time = 0

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
        const requiredLimits: Record<string, number> = {
            maxComputeWorkgroupStorageSize: wanted_storage,
        }
        // Unknown limit names reject requestDevice, so only where immediates exist.
        const max_immediate = (adapter.limits as any).maxImmediateSize
        if (max_immediate) requiredLimits.maxImmediateSize = max_immediate

        let device = await adapter
            .requestDevice({ requiredFeatures, requiredLimits })
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

        {
            const subtitles = new SubtitleOverlay(device, this.canvas_format)
            subtitles.visible = this.#captions
            // Playing, the next frame picks them up.
            subtitles.on_update = () => {
                if (this.#e_video.paused) this.#have_frame = true
            }
            subtitles.lut = () => {
                const lut3d = this.#effects.find(e => e instanceof EffectLut3d) as any
                return lut3d?.lut_view ?? null
            }
            if (this.#sub_renderer) subtitles.set_jassub(this.#sub_renderer)
            this.#subtitles = subtitles
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

        const render = (t: number) => {
            requestAnimationFrame(render)
            if (this.#e_video.videoWidth == 0) return

            // We are using requestAnimationFrame in a busy loop to keep the gpu from going to sleep
            if (!this.#have_frame) {
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

            // No new metadata: a redraw of the same frame, or the polyfill, which never has any.
            if (metadata != null) this.#media_time = metadata.mediaTime
            else if (!this.#frame_metadata_available) this.#media_time = this.#e_video.currentTime
            const media_time = this.#media_time

            this.#subtitles?.resize(this.#e_canvas.width, this.#e_canvas.height)
            this.#subtitles?.request(media_time, !this.#e_video.paused)

            const encoder = device.createCommandEncoder()

            canvas_res[0] = this.#e_canvas.width
            canvas_res[1] = this.#e_canvas.height

            const texture_canvas = context.getCurrentTexture().createView()

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

            this.#subtitles?.composite(encoder, texture_canvas, media_time)

            timer.finish()

            const t2 = performance.now()
            device.queue.submit([encoder.finish()])

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
        this.set_playing(false)
        this.#clear?.()

        this.set_subtitles(subtitles)
    }

    set_volume(v: number) {
        this.#e_video.volume = v
    }

    set_captions(b: boolean) {
        this.#captions = b
        if (this.#subtitles) this.#subtitles.visible = b
        this.#have_frame = true
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
