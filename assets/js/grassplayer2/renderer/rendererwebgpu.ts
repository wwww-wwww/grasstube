import Renderer from "./renderer"

import SubtitlesOctopus from "../subtitles-octopus2"

import Timer from "../timer"

import Resizer, { ResizerBestFit } from "../resizer"

import EffectArt from "../effects/artcnn"
import EffectDeband from "../effects/deband"
import EffectDehalo from "../effects/dehalo"
import EffectLoad from "../effects/load"
import EffectLut3d from "../effects/lut3d"

import SamplerDefault from "../samplers/default"
import SamplerDefaultLinear from "../samplers/defaultlinear"
import SamplerSphere from "../samplers/sphere"
import GrassPlayer from "../grassplayer2"
import Effect from "../effects/_effect"

import rvfc_firefox from "./rvfc_firefox"

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

    #e_video: HTMLVideoElement
    #e_canvas: HTMLCanvasElement
    #e_subtitles: HTMLElement
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

    #fonts: any
    #octopus: SubtitlesOctopus | null = null
    #current_subtitles: string | null = null
    set_subtitles(subtitles: string | null) {
        this.#current_subtitles = subtitles

        if (this.#octopus) {
            this.#octopus.destroy()
            this.#octopus = null
            while (this.#e_subtitles.firstChild)
                this.#e_subtitles.removeChild(this.#e_subtitles.firstChild)
        }

        if (subtitles == null || subtitles.length == 0) return

        this.#octopus = new SubtitlesOctopus({
            video: this.#e_video,
            canvasParent: this.#e_subtitles,
            proxyCanvas: this.#e_canvas,
            subUrl: subtitles,
            availableFonts: this.#fonts,
            workerUrl: "/includes/subtitles-octopus-worker.js",
        })
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

    #clear?: () => void
    #sampler: any
    #effects: Effect[] = []
    #textures: any = {}
    #texture_views: any = {}
    async init(root: HTMLElement, root_settings: HTMLElement) {
        const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })
        const device = await adapter?.requestDevice({
            requiredFeatures: ["timestamp-query"],
            requiredLimits: { maxComputeWorkgroupStorageSize: 32768 },
        })

        if (!device) {
            alert("Failed to get WebGPU device")
            this.player.set_storage("webgpu-disable-temporary", 1)
            this.player.set_storage("renderer", 1)
            window.location.reload()
            return
        }

        this.device = device

        console.log("gpu loaded")

        const context = this.#e_canvas.getContext("webgpu") as GPUCanvasContext
        context.configure({
            device: device,
            format: "rgba8unorm",
            colorSpace: "srgb",
            // @ts-ignore
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
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
                            e.init()
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
            if (e.enabled) {
                e.init()
            }
        })

        const timer = new Timer(device)

        const framenumber = root_settings.querySelector(".framenumber")!
        const txt_fps = root_settings.querySelector(".fps")!
        const totaltime = root_settings.querySelector(".totaltime")!
        const jstime = root_settings.querySelector(".jstime")!
        const queuetime = root_settings.querySelector(".queuetime")!
        const gputime = root_settings.querySelector(".gputime")!
        const timing = root_settings.querySelector(".timing")!

        let frame_n = 0
        let last_t = 0

        if (this.player.get_storage("webgpu-testing-rvfc") == "1") {
            this.#e_videoinfo_method.selectedIndex = 1
            rvfc_firefox(this.#e_video, () => {
                this.#have_frame = true
            })
        } else {
            this.#e_videoinfo_method.selectedIndex = 0
            const tz = () => {
                this.#have_frame = true
                this.#e_video.requestVideoFrameCallback(tz)
            }
            this.#e_video.requestVideoFrameCallback(tz)
        }

        let render = (t: number) => {
            requestAnimationFrame(render)
            if (this.#e_video.videoWidth == 0) return

            // We are using requestAnimationFrame in a busy loop to keep the gpu from going to sleep
            if (!this.#have_frame) {
                const encoder = device.createCommandEncoder()
                device.queue.submit([encoder.finish()])
                return
            }
            this.#have_frame = false

            let video_time = this.current_time()

            const t0 = performance.now()
            const encoder = device.createCommandEncoder()

            let texture_video
            try {
                texture_video = device.importExternalTexture({ source: this.#e_video })
            } catch (e) {
                return
            }

            const texture_canvas = context.getCurrentTexture().createView()

            timer.start(encoder)

            let last_tex = texture_video
            let last_tex_res = [this.#e_video.videoWidth, this.#e_video.videoHeight]

            this.#effects.forEach(e => {
                if (!e.enabled) return
                ;[last_tex, last_tex_res] = timer.run(e, video_time, last_tex, last_tex_res)
            })

            timer.run(this.#sampler, video_time, last_tex, last_tex_res, texture_canvas, [
                this.#e_canvas.width,
                this.#e_canvas.height,
            ])

            timer.finish()

            const t2 = performance.now()
            device.queue.submit([encoder.finish()])

            if (timer.enabled) {
                timer
                    .results()
                    .then(({ sum, passes }) => {
                        let txt = ""
                        for (let i = 0; i < passes.length; i++) {
                            txt += `${i} ${passes[i][0]}: ${passes[i][1]}\n`
                        }

                        timing.textContent = txt
                        gputime.textContent = (sum / 1000000).toFixed(4)
                    })
                    .catch(() => {})
            }

            device.queue.onSubmittedWorkDone().then(() => {
                const t3 = performance.now()
                totaltime.textContent = (t3 - t0).toFixed(4)
                queuetime.textContent = (t3 - t2).toFixed(4)
            })

            const t1 = performance.now()
            jstime.textContent = (t1 - t0).toFixed(4)
            framenumber.textContent = (++frame_n).toString()
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
                    timings.sort()
                    resolve(timings)
                }

                video.play()
            }

            video.muted = true
            video.src = "/includes/50fps.mp4"
            video.play()
        })

        const dropped_frames = 25 - timings.length
        const median = timings.at(timings.length / 2)!

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

    get_texture(dims: [number, number], not = []) {
        const id = dims.toString()
        if (id in this.#texture_views) {
            for (let i = 0; i < this.#texture_views[id].length; i++) {
                // @ts-ignore
                if (!not.includes(this.#texture_views[id][i])) {
                    return this.#texture_views[id][i]
                }
            }
        }

        console.log(`Create texture ${dims}`)

        const texture = this.device!.createTexture({
            size: dims,
            format: "rgba16float",
            // @ts-ignore
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
        })
        const view = texture.createView()

        if (!(id in this.#texture_views)) {
            this.#textures[id] = []
            this.#texture_views[id] = []
        }

        this.#textures[id].push(texture)
        this.#texture_views[id].push(view)

        return view
    }

    resize() {
        this.resizer!.resize()
        this.#have_frame = true
    }

    reload() {
        this.#e_video.requestVideoFrameCallback(async () => {
            await this.#loaded

            this.#textures = {}
            this.#texture_views = {}

            this.resize()
        })
    }

    set_video(video: string | null, subtitles: string | null) {
        this.#e_video.src = video || ""
        this.set_playing(false)
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
        let catchup_mul = 1 + dir * (dist > 0.5 ? 0.1 : 0.05)

        if (Math.abs(dist) < 0.02) {
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
