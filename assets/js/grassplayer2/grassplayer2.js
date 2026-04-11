import SubtitlesOctopus from "../subtitles-octopus2"

import Seekbar from "./seekbar"

import Timer from "./timer"

import { BestFitResizer, StretchResizer } from "./resizer"

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

class WebGPURenderer {
    #resizer
    #device
    #have_frame

    #loaded
    #e_video
    #e_canvas
    constructor(root) {
        this.#e_video = root.querySelector("video")
        this.#e_canvas = root.querySelector("canvas.video")

        this.#loaded = this.init(root)
    }

    #texturewidth
    #textureheight
    #sampler
    #effects
    #textures = {}
    #texture_views = {}
    async init(root) {
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
                new BestFitResizer(this.#device, root, this.#e_video, this.#e_canvas),
                // new StretchResizer(this.#device, root, this.#e_video, this.#e_canvas),
            ]

            const select = root.querySelector(".select-resizers")
            options.forEach(e => {
                create_element("option", select).textContent = e.constructor.name
            })

            select.addEventListener("change", () => {
                console.log(select.selectedIndex)
            })

            this.#resizer = options[0]

            const observer = new ResizeObserver(() => this.resize())
            observer.observe(root)

            const div = root.querySelector(".resizer")
            const el = create_element("div", div, "options")
            this.#resizer.create_settings(el)
        }

        // Create effects
        {
            this.#effects = [
                new EffectLoad(this.#device),
                new EffectDeband(this.#device),
                new EffectLut3d(this.#device),
                new EffectLinear(this.#device),
                new EffectDehalo(this.#device),
                new EffectArt(this.#device),
            ]

            const div = root.querySelector(".filters")
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

            const select = root.querySelector(".select-sampler")
            options.forEach(e => {
                create_element("option", select).textContent = e.constructor.name
            })

            const div = root.querySelector(".sampler")

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

        const framenumber = root.querySelector(".framenumber")
        const txt_fps = root.querySelector(".fps")
        const totaltime = root.querySelector(".totaltime")
        const jstime = root.querySelector(".jstime")
        const queuetime = root.querySelector(".queuetime")
        const gputime = root.querySelector(".gputime")
        const timing = root.querySelector(".timing")

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
}

const html = `
<div class="grassplayer2" tabindex="0">
<input id="chk_split" type="checkbox"></input>
<video controls crossorigin="anonymous"></video>
<canvas class="video" width="1920" height="1080"></canvas>
<div class="subtitles"></div>
<div class="overlay">
    <div class="main">
        <div class="messages"></div>
        <div class="settings" style="display: none;">
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
                    <div class="videoinfo-video-container"></div>
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
                    <div>
                        <span>Show split video</span>
                        <label id="lbl_split" for="chk_split"></label>
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
        </div>
    </div>
    <div class="controls">
        <div class="left">
            <input type="checkbox" class="chk-play"></input>
            <button class="chk-next"></button>
        </div>
        <div class="right">
            <div class="volume">
                <input type="range" class="range-volume" min="0" max="100"/>
                <div class="range-volume-progress"><div class="range-volume-progress-track"></div></div>
            </div>
            <input type="checkbox" class="chk-captions"></input>
            <input type="checkbox" class="chk-settings"></input>
            <input type="checkbox" class="chk-fullscreen"></input>
        </div>
        <div class="seekbar">
        </div>
    </div>
</div>
</div>
`

export default class GrassPlayer {
    #e_video
    #e_canvas
    #e_subtitles

    #renderer
    #seekbar

    #e_main
    #e_chk_play
    #e_messages
    #e_videoinfo_catchup

    on_toggle_playing = null
    on_seek = null
    on_next = null
    on_buffer = null

    constructor(root, controls = true) {
        window.gp = this
        root.innerHTML = html

        this.#e_main = root.querySelector(".grassplayer2")

        this.#e_video = root.querySelector("video")
        this.#e_canvas = root.querySelector("canvas.video")
        this.#e_subtitles = root.querySelector("div.subtitles")
        this.#e_messages = root.querySelector(".messages")
        this.#e_videoinfo_catchup = root.querySelector(".videoinfo-catchup")

        this.#renderer = new WebGPURenderer(root)

        root.querySelector(".videoinfo-video-container").appendChild(this.#e_video)

        // overlay show/hide
        let overlay_timeout = null
        const show_overlay = e => {
            this.#e_main.classList.toggle("show", true)

            if (overlay_timeout != null) {
                clearTimeout(overlay_timeout)
            }

            if (e != null &&
                (e.target.closest(".settings") != null ||
                    e.target.closest(".controls") != null)) {
                return
            }

            overlay_timeout = setTimeout(() => {
                this.#e_main.classList.toggle("show", false)
            }, 2000)
        }

        this.#e_main.addEventListener("pointerdown", show_overlay)
        this.#e_main.addEventListener("pointermove", show_overlay)

        this.#e_main.addEventListener("mouseleave", () => {
            this.#e_main.classList.toggle("show", false)
        })

        // play button
        {
            this.#e_chk_play = root.querySelector(".chk-play")
            this.#e_chk_play.addEventListener("change", () => {
                const playing = this.#e_chk_play.checked

                this.#toggle_playing(playing)
            })
        }

        // volume slider
        {
            const range_volume = root.querySelector(".range-volume")
            const range_volume_progress = root.querySelector(".range-volume-progress-track")

            this.volume_change = (v) => {
                range_volume.value = v * 100
                range_volume_progress.style.width = `${v * 100}%`
            }

            range_volume.addEventListener("input", () => {
                this.set_volume(range_volume.value / 100)
            })
        }

        // settings button
        {
            const chk = root.querySelector(".chk-settings")
            const e_settings = root.querySelector(".settings")
            chk.addEventListener("change", () => {
                e_settings.style.display = chk.checked ? "" : "none"
            })
        }

        // next button
        {
            root.querySelector(".chk-next").addEventListener("click", () => {
                this.on_next()
            })
        }

        // captions button
        {
            const chk = root.querySelector(".chk-captions")
            chk.addEventListener("input", () => {
                this.#e_subtitles.style.display = !chk.checked ? "" : "none"
            })
        }

        // fullscreen button
        {
            const chk = root.querySelector(".chk-fullscreen")
            chk.addEventListener("input", () => {
                this.#toggle_fullscreen()
            })
            document.addEventListener("fullscreenchange", () => {
                chk.checked = document.fullscreenElement == this.#e_main
            })
        }

        this.#seekbar = new Seekbar(root.querySelector(".seekbar"), this, this.#e_video)

        {
            const resolution = root.querySelector(".videoinfo-resolution")
            this.#e_video.addEventListener("loadedmetadata", () => {
                resolution.textContent = `${this.#e_video.videoWidth}x${this.#e_video.videoHeight}`
            })
        }

        {
            const buffered = root.querySelector(".videoinfo-buffered")
            // video buffer
            this.#e_video.addEventListener("timeupdate", () => {
                const end = this.#update_playable()
                buffered.textContent = `${Math.round(end - this.#e_video.currentTime)} seconds`
            })

            this.#e_video.addEventListener("progress", () => {
                const end = this.#update_playable()
                buffered.textContent = `${Math.round(end - this.#e_video.currentTime)} seconds`
            })
        }

        // keyboard shortcuts
        {
            window.addEventListener("keydown", e => {
                if (document.activeElement.closest(".grassplayer2") == null) return

                if (e.key == "f") {
                    this.#toggle_fullscreen()
                } else if (e.key == "ArrowLeft") {
                    e.preventDefault()
                    this.seek(this.current_time() - 5, true)
                } else if (e.key == "ArrowRight") {
                    e.preventDefault()
                    this.seek(this.current_time() + 5, true)
                } else if (e.key == "ArrowUp") {
                    e.preventDefault()
                    this.set_volume(this.#volume + 0.1)
                    const m = this.create_message(Math.round(this.#volume * 100), 1000)
                    m.classList.toggle("volume-up")
                } else if (e.key == "ArrowDown") {
                    e.preventDefault()
                    this.set_volume(this.#volume - 0.1)
                    const m = this.create_message(Math.round(this.#volume * 100), 1000)
                    m.classList.toggle("volume-down")
                } else if (e.key == " ") {
                    e.preventDefault()
                    this.#toggle_playing()
                }
            })
        }

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

    #update_playable() {
        for (let i = 0; i < this.#e_video.buffered.length; i++) {
            const start = this.#e_video.buffered.start(i)
            const end = this.#e_video.buffered.end(i)
            if ((start < this.#e_video.currentTime || start < 1) && end > this.#e_video.currentTime) {
                if (this.on_buffer) {
                    this.on_buffer(end)
                }

                return end
            }
        }
    }

    #toggle_playing(playing = null) {
        if (playing == null) {
            playing = !this.playing()
        }

        if (this.on_toggle_playing != null) {
            this.on_toggle_playing(playing)
        } else {
            this.set_playing(playing)
        }
    }

    create_message(message, timeout = null) {
        const el = document.createElement("div")
        el.className = "message"
        el.textContent = message
        el.addEventListener("click", () => {
            this.#e_messages.removeChild(el)
        })

        this.#e_messages.appendChild(el)
        if (timeout != null && timeout > 0) {
            setTimeout(() => {
                if (el.parentElement == this.#e_messages) {
                    this.#e_messages.removeChild(el)
                }
            }, timeout)
        }
        return el
    }

    volume_change
    #volume = 0.5
    set_volume(v) {
        v = Math.min(Math.max(v, 0), 1)
        v = Math.round(v * 100) / 100

        this.#volume = v

        this.#e_video.volume = (Math.pow(10, v) - 1) / 9

        this.volume_change(v)
    }

    #speed = 1
    set_speed(s) {
        this.#speed = 1
        this.#e_video.playbackRate = s
    }

    playing() {
        return !this.#e_video.paused
    }

    current_time() {
        return this.#e_video.currentTime
    }

    duration() {
        return this.#e_video.duration || 0
    }

    set_video(type, videos, subtitles) {
        this.set_playing(false)

        const keys = Object.keys(videos)

        if (keys.length > 0) {
            this.#e_video.src = videos["default"]
            this.#renderer.reload()
        } else {
            this.#e_video.src = ""
            this.#renderer.clear()
        }

        this.set_subtitles(subtitles)

        this.#seekbar.reset()
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

    auto_set_playing(playing) {
        this.set_playing(playing)
    }

    set_playing(playing) {
        if (this.playing() == playing) return

        this.#e_chk_play.checked = playing

        this.#catchup_done = false

        if (playing) {
            if (this.#e_video.currentTime >= this.#e_video.duration) return
            this.#e_video.play()
        } else {
            this.#e_video.pause()
        }
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

    auto_seek(t) {
        if (t == undefined) return
        if (this.#seekbar.seeking) return

        this.#catchup_done = false

        this.seek(t)
    }

    on_fullscreen = null

    #toggle_fullscreen() {
        if (this.on_fullscreen) {
            this.on_fullscreen()
            return
        }

        if (document.fullscreenElement == this.#e_main) {
            document.exitFullscreen()
        } else {
            this.#e_main.requestFullscreen()
        }
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
