import SubtitlesOctopus from "../subtitles-octopus2"

import Timer from "./timer"

import { ResizerBestFit, ResizerStretch } from "./resizer"

import EffectArt from "./effects/artcnn"
import EffectDeband from "./effects/deband"
import EffectDehalo from "./effects/dehalo"
import EffectLinear from "./effects/linear"
import EffectLoad from "./effects/load"
import EffectLut3d from "./effects/lut3d"

import { SamplerDefault, SamplerDefaultLinear, SamplerHermite } from "./samplers/default"
import SamplerSphere from "./samplers/sphere"

function create_element(tagname, root = null, classes = "") {
    const e = document.createElement(tagname)

    if (classes.length > 0) {
        for (const class_name of classes.split(" ")) {
            e.classList.toggle(class_name, true)
        }
    }

    if (root) root.appendChild(e)
    return e
}

export default class WebGPURenderer {
    #resizer
    #device
    #have_frame

    #e_video
    #e_canvas

    #e_subtitles

    #e_videoinfo_catchup

    on_buffer_end
    on_buffers
    on_timeupdate

    #loaded
    constructor(root, root_settings) {
        root.innerHTML = `
<canvas class="video" width="1920" height="1080"></canvas>
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
                <option>Hybrid</option>
                <option>requestVideoFrameCallback</option>
                <option>requestAnimationFrame</option>
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
    <div class="sampler options"></div>
</div>
`

        this.#e_video = root_settings.querySelector("video")
        this.#e_canvas = root.querySelector("canvas.video")
        this.#e_subtitles = root.querySelector("div.subtitles")

        this.#e_videoinfo_catchup = root_settings.querySelector(".videoinfo-catchup")

        {
            const resolution = root_settings.querySelector(".videoinfo-resolution")
            this.#e_video.addEventListener("loadedmetadata", () => {
                resolution.textContent = `${this.#e_video.videoWidth}x${this.#e_video.videoHeight}`
            })
        }

        {
            const buffered = root_settings.querySelector(".videoinfo-buffered")
            // video buffer
            this.#e_video.addEventListener("timeupdate", () => {
                this.on_timeupdate((this.#e_video.currentTime || 0) / this.#e_video.duration)
                const end = this.#update_playable()
                buffered.textContent = `${Math.round(end - this.#e_video.currentTime) || 0} seconds`
            })

            this.#e_video.addEventListener("progress", () => {
                this.on_buffers(this.#e_video.buffered, this.#e_video.duration)

                const end = this.#update_playable()
                buffered.textContent = `${Math.round(end - this.#e_video.currentTime) || 0} seconds`
            })
        }

        this.#loaded = this.init(root, root_settings)

        fetch("https://r2tube.grass.moe/fonts.json")
            .then(res => res.json())
            .then(fonts => {
                for (const key of Object.keys(fonts)) {
                    fonts[key] = fonts[key].map(f => f)
                }
                this.#set_fonts(fonts)
                this.set_subtitles(this.#current_subtitles)
                console.log("fonts:loaded")
            })
            .catch(err => {
                console.log("fonts:error fetching", err)
            })

    }

    #fonts
    #set_fonts(fonts) {
        this.#fonts = fonts
    }

    #octopus
    #current_subtitles
    set_subtitles(subtitles) {
        this.#current_subtitles = subtitles

        if (this.#octopus) {
            this.#octopus.destroy()
            this.#octopus = null
            while (this.#e_subtitles.firstChild)
                this.#e_subtitles.removeChild(this.#e_subtitles.firstChild)
        }

        this.#octopus = new SubtitlesOctopus({
            video: this.#e_video,
            canvasParent: this.#e_subtitles,
            proxyCanvas: this.#e_canvas,
            subUrl: subtitles,
            fallbackFont: "https://r2tube.grass.moe/fonts/arialbd.ttf",
            availableFonts: this.#fonts,
            workerUrl: "/includes/subtitles-octopus-worker.js"
        })
    }

    #update_playable() {
        for (let i = 0; i < this.#e_video.buffered.length; i++) {
            const start = this.#e_video.buffered.start(i)
            const end = this.#e_video.buffered.end(i)
            if ((start < this.#e_video.currentTime || start < 1) && end > this.#e_video.currentTime) {
                if (this.on_buffer_end) {
                    this.on_buffer_end(end)
                }

                return end
            }
        }
    }

    #texturewidth
    #textureheight
    #sampler
    #effects
    #textures = {}
    #texture_views = {}
    async init(root, root_settings) {
        const adapter = await navigator.gpu?.requestAdapter({
            powerPreference: "high-performance",
        })
        this.#device = await adapter?.requestDevice({
            requiredFeatures: ["timestamp-query"],
            requiredLimits: {
                maxComputeWorkgroupStorageSize: 32768
            }
        })

        if (!this.#device) {
            console.log("need a browser that supports WebGPU")
            return
        }

        console.log("gpu loaded")

        const context = this.#e_canvas.getContext("webgpu")
        context.configure({
            device: this.#device, format: "rgba8unorm", colorSpace: "srgb",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
        })

        this.clear = () => {
            const commandEncoder = this.#device.createCommandEncoder()
            const textureView = context.getCurrentTexture().createView()

            const renderPassDescriptor = {
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
            this.#device.queue.submit([commandEncoder.finish()])
        }

        // Create resizer
        {
            const options = [
                new ResizerBestFit(this.#device, root, this.#e_video, this.#e_canvas),
                // new ResizerStretch(this.#device, root, this.#e_video, this.#e_canvas),
            ]

            const select = root_settings.querySelector(".select-resizers")
            options.forEach(e => {
                create_element("option", select).textContent = e.constructor.name
            })

            select.addEventListener("change", () => {
                console.log(select.selectedIndex)
            })

            this.#resizer = options[0]

            const observer = new ResizeObserver(() => this.resize())
            observer.observe(root)

            const div = root_settings.querySelector(".resizer")
            const el = create_element("div", div, "options")
            this.#resizer.create_settings(el)
        }

        // Create effects
        {
            this.#effects = [
                new EffectLoad(this.#device),
                new EffectDeband(this.#device),
                new EffectLut3d(this.#device),
                new EffectDehalo(this.#device),
                new EffectArt(this.#device),
                new EffectLinear(this.#device),
            ]

            const div = root_settings.querySelector(".filters")
            this.#effects.forEach(e => {
                e.on_update = () => { this.#have_frame = true }

                const el = create_element("div", div)

                const title = create_element("div", el, "title")
                if (!e.force) {
                    const check = create_element("input", title)
                    check.type = "checkbox"
                    check.checked = e.enabled
                    check.addEventListener("input", () => {
                        e.enabled = check.checked
                        if (e.enabled) {
                            if (!e.initialized) { e.init() }
                            e.resize(this.#texturewidth, this.#textureheight)
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
                new SamplerDefaultLinear(this.#device, this.#e_video, this.#e_canvas),
                new SamplerDefault(this.#device, this.#e_video, this.#e_canvas),
                new SamplerHermite(this.#device, this.#e_video, this.#e_canvas),
                new SamplerSphere(this.#device, this.#e_video, this.#e_canvas),
            ]

            const select = root_settings.querySelector(".select-sampler")
            options.forEach(e => {
                create_element("option", select).textContent = e.constructor.name
            })

            const div = root_settings.querySelector(".sampler")

            select.addEventListener("change", () => {
                while (div.firstChild) { div.removeChild(div.firstChild) }
                options[select.selectedIndex].create_settings(div)
                options[select.selectedIndex].init()
                this.#sampler = options[select.selectedIndex]
                this.#sampler.reset()
                this.#have_frame = true
            })

            this.#sampler = options[0]
            this.#sampler.init()
            this.#sampler.create_settings(div)
        }

        this.#prepare_textures(4, 4)

        this.#effects.forEach(e => {
            if (e.enabled) { e.init() }
        })

        const get_texture = (dims, not = []) => {
            const id = dims.toString()
            if (id in this.#texture_views) {
                for (let i = 0; i < this.#texture_views[id].length; i++) {
                    if (!not.includes(this.#texture_views[id][i])) {
                        return this.#texture_views[id][i]
                    }
                }
            }

            console.log(`Create texture ${dims}`)

            const texture = this.#device.createTexture({
                size: dims,
                format: "rgba16float",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
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

        const timer = new Timer(this.#device)

        const framenumber = root_settings.querySelector(".framenumber")
        const txt_fps = root_settings.querySelector(".fps")
        const totaltime = root_settings.querySelector(".totaltime")
        const jstime = root_settings.querySelector(".jstime")
        const queuetime = root_settings.querySelector(".queuetime")
        const gputime = root_settings.querySelector(".gputime")
        const timing = root_settings.querySelector(".timing")

        let frame_n = 0
        let last_t = 0

        let tz = () => {
            this.#have_frame = true
            this.#e_video.requestVideoFrameCallback(tz)
        }
        this.#e_video.requestVideoFrameCallback(tz)

        let render = t => {
            requestAnimationFrame(render)
            if (this.#e_video.videoWidth == 0) return

            if (!this.#have_frame) {
                const encoder = this.#device.createCommandEncoder()
                this.#device.queue.submit([encoder.finish()])
                return
            }
            this.#have_frame = false

            let video_time = this.#e_video.currentTime

            const t0 = performance.now()
            const encoder = this.#device.createCommandEncoder()

            let texture_video
            try {
                texture_video = this.#device.importExternalTexture({ source: this.#e_video })
            } catch (e) { return }

            const texture_canvas = context.getCurrentTexture().createView()

            timer.start(encoder)

            let last_tex = texture_video
            let last_tex_res = [this.#e_video.videoWidth, this.#e_video.videoHeight]

            this.#effects.forEach(e => {
                if (!e.enabled) return

                const res = timer.run(e, t, video_time, last_tex_res, last_tex, get_texture)

                last_tex = res[0]
                last_tex_res = res[1]
            })

            timer.run(this.#sampler, t, video_time, last_tex_res, last_tex,
                [this.#e_canvas.width, this.#e_canvas.height], texture_canvas)

            timer.finish()

            const t2 = performance.now()
            this.#device.queue.submit([encoder.finish()])

            if (timer.enabled) {
                timer.results().then(({ sum, passes }) => {
                    let txt = ""
                    for (let i = 0; i < passes.length; i++) {
                        txt += `${i} ${passes[i][0]}: ${passes[i][1]}\n`
                    }

                    timing.textContent = txt
                    gputime.textContent = (sum / 1000000).toFixed(4)
                }).catch(() => { })
            }

            this.#device.queue.onSubmittedWorkDone().then(() => {
                const t3 = performance.now()
                totaltime.textContent = (t3 - t0).toFixed(4)
                queuetime.textContent = (t3 - t2).toFixed(4)
            })

            const t1 = performance.now()
            jstime.textContent = (t1 - t0).toFixed(4)
            framenumber.textContent = ++frame_n
            txt_fps.textContent = (1000 / (t - last_t)).toFixed(4)
            last_t = t
        }
        requestAnimationFrame(render)
    }


    #prepare_textures(width, height) {
        this.#textures = {}
        this.#texture_views = {}

        this.#texturewidth = width
        this.#textureheight = height

        this.#effects.forEach(e => {
            if (e.enabled) {
                e.resize(this.#texturewidth, this.#textureheight)
            }
        })
    }

    resize() {
        this.#resizer.resize()
        this.#have_frame = true
    }

    reload() {
        this.#e_video.requestVideoFrameCallback(async () => {
            await this.#loaded

            this.#prepare_textures(this.#e_video.videoWidth, this.#e_video.videoHeight)

            this.resize()
        })
    }

    clear() { }

    set_captions(b) {
        this.#e_subtitles.style.display = b ? "" : "none"
    }

    playing() {
        return !this.#e_video.paused
    }

    duration() {
        return this.#e_video.duration || 0
    }

    set_video(type, videos, subtitles) {
        this.set_playing(false)

        const keys = Object.keys(videos)

        if (keys.length > 0) {
            this.#e_video.src = videos["default"]
            this.reload()
        } else {
            this.#e_video.src = ""
            this.clear()
        }

        this.set_subtitles(subtitles)
    }

    set_volume(v) {
        this.#e_video.volume = (Math.pow(10, v) - 1) / 9
    }

    #speed = 1
    set_speed(s) {
        this.#speed = 1
        this.#e_video.playbackRate = s
    }

    set_playing(playing) {
        if (this.playing() == playing) return

        this.#catchup_done = false

        if (playing) {
            if (this.#e_video.currentTime >= this.#e_video.duration) return
            this.#e_video.play()
        } else {
            this.#e_video.pause()
        }
    }

    current_time() {
        return this.#e_video.currentTime
    }

    seek(t, final = false) {
        if (this.duration() == 0) return

        t = Math.max(0, t)

        if (final && this.on_seek) {
            this.on_seek(t)
            return
        }

        this.#catchup_done = false

        this.#e_video.currentTime = t
    }

    #catchup_done = false
    #catchup_target = null
    #catchup_target_time = null
    #catchup_timeout = null
    #catchup_interval = null
    set_catchup(target, time) {
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
        const elapsed = (Date.now() - this.#catchup_target_time) / 1000
        const dist = (this.#catchup_target + elapsed) - this.current_time()

        const dir = dist > 0 ? 1 : -1
        let catchup_mul = 1 + dir * (dist > 0.5 ? 0.1 : 0.05)

        if (Math.abs(dist) < 0.02) {
            this.#catchup_done = true
            catchup_mul = 1
            clearInterval(this.#catchup_interval)
        }

        this.set_speed(this.#speed * catchup_mul)

        this.#e_videoinfo_catchup.textContent = `${dist.toFixed(5)} ${catchup_mul.toFixed(5)}x`
    }
}
