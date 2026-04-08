import SubtitlesOctopus from "./subtitles-octopus"

import {
    EffectLoad,
    EffectLut3d,
    EffectDeband,
} from "./effects"

import {
    SamplerHermite,
    SamplerDefault,
    SamplerSphere,
} from "./samplers"

import SamplerArt from "./artcnn"

import { BestFitResizer, StretchResizer } from "./resizer"

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

class Timer {
    #labelmap
    #encoder
    #i
    #querySet
    #resolveBuffer
    #resultBuffer
    enabled = true
    constructor(device) {
        this.#querySet = device.createQuerySet({
            type: "timestamp",
            count: 32,
        })
        this.#resolveBuffer = device.createBuffer({
            size: this.#querySet.count * 8,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        })
        this.#resultBuffer = device.createBuffer({
            size: this.#resolveBuffer.size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
    }
    beginComputePass(desc = {}) {
        if (!this.enabled) {
            return this.#encoder.beginComputePass(desc)
        }
        const pass = this.#encoder.beginComputePass({
            ...desc,
            timestampWrites: {
                querySet: this.#querySet,
                beginningOfPassWriteIndex: this.#i++,
                endOfPassWriteIndex: this.#i++,
            }
        })
        this.#labelmap[this.#i / 2 - 1] = desc.label
        return pass

    }
    start(encoder) {
        this.#labelmap = []
        this.#encoder = encoder
        this.#i = 0
    }
    run(effect, t, video_time, tex1, tex2) {
        effect.run(this, t, video_time, tex1, tex2)
    }
    finish() {
        if (!this.enabled) return
        this.#encoder.resolveQuerySet(this.#querySet, 0, this.#querySet.count, this.#resolveBuffer, 0)

        if (this.#resultBuffer.mapState === "unmapped") {
            this.#encoder.copyBufferToBuffer(this.#resolveBuffer, 0, this.#resultBuffer, 0, this.#resultBuffer.size)
        }
    }
    results() {
        return new Promise(async (resolve, reject) => {
            if (this.#resultBuffer.mapState === "unmapped") {
                await this.#resultBuffer.mapAsync(GPUMapMode.READ)
                const times = new BigUint64Array(this.#resultBuffer.getMappedRange())
                const passes = []

                let sum = 0
                for (let i = 0; i < this.#labelmap.length; i++) {
                    const duration = Number(times[i * 2 + 1] - times[i * 2])
                    sum += duration
                    passes[i] = [this.#labelmap[i], duration]
                }

                this.#resultBuffer.unmap()

                resolve({ sum, passes })
            } else {
                reject()
            }
        })
    }

}

class WebGPURenderer {
    #resizer
    #device

    constructor(root) {
        this.video = root.querySelector("video")
        this.canvas = root.querySelector("canvas")

        this.textures = []
        this.loaded = this.init(root)
    }

    async init(root) {
        const adapter = await navigator.gpu?.requestAdapter()
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

        const context = this.canvas.getContext("webgpu")
        context.configure({
            device: this.#device, format: "rgba8unorm", colorSpace: "srgb",
            usage: GPUTextureUsage.STORAGE_BINDING
        })

        // Create resizer
        {
            const options = [
                new BestFitResizer(this.#device, root, this.video, this.canvas),
                new StretchResizer(this.#device, root, this.video, this.canvas),
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

        let have_frame = false
        // Create effects
        {
            this.effects = [
                new EffectDeband(this.#device),
                new EffectLut3d(this.#device),
            ]

            const div = root.querySelector(".filters")
            this.effects.forEach(e => {
                const el = create_element("div", div)

                const title = create_element("div", el, "title")
                const check = create_element("input", title)
                check.type = "checkbox"
                check.checked = e.enabled
                check.addEventListener("input", () => {
                    e.enabled = check.checked
                    have_frame = true
                })

                const title_text = create_element("span", title)
                title_text.textContent = e.constructor.name

                const body = create_element("div", el, "options")
                e.create_settings(body)
            })
        }

        // Create upsampler
        {
            const options = [
                new SamplerDefault(this.#device, this.video, this.canvas),
                new SamplerHermite(this.#device, this.video, this.canvas),
                new SamplerArt(this.#device, this.video, this.canvas),
                new SamplerSphere(this.#device, this.video, this.canvas),
            ]

            const select = root.querySelector(".select-upsamplers")
            options.forEach(e => {
                create_element("option", select).textContent = e.constructor.name
            })

            const div = root.querySelector(".upsampler")

            select.addEventListener("change", () => {
                while (div.firstChild) { div.removeChild(div.firstChild) }
                options[select.selectedIndex].create_settings(div)
                options[select.selectedIndex].init()
                this.upsampler = options[select.selectedIndex]
                this.resize()
            })

            this.upsampler = options[0]
            this.upsampler.init()
            this.upsampler.create_settings(div)
        }

        // Create downsampler
        {
            const options = [
                new SamplerDefault(this.#device, this.video, this.canvas),
                new SamplerHermite(this.#device, this.video, this.canvas),
                new SamplerSphere(this.#device, this.video, this.canvas),
            ]

            const select = root.querySelector(".select-downsamplers")
            options.forEach(e => {
                create_element("option", select).textContent = e.constructor.name
            })

            select.addEventListener("change", () => {
                console.log(select.selectedIndex)
            })

            this.downsampler = options[0]
            this.downsampler.init()

            const div = root.querySelector(".downsampler")
            this.downsampler.create_settings(div)
        }

        this.#prepare_textures(4, 4)

        this.effects.forEach(e => e.init())

        const timer = new Timer(this.#device)
        // timer.enabled = false

        const framenumber = root.querySelector(".framenumber")
        const txt_fps = root.querySelector(".fps")
        const totaltime = root.querySelector(".totaltime")
        const jstime = root.querySelector(".jstime")
        const queuetime = root.querySelector(".queuetime")
        const gputime = root.querySelector(".gputime")
        const timing = root.querySelector(".timing")

        this.load = new EffectLoad(this.#device)

        let frame_n = 0
        let last_t = 0

        let tz = () => {
            have_frame = true
            this.video.requestVideoFrameCallback(tz)
        }
        this.video.requestVideoFrameCallback(tz)

        let texture_index = 0
        let render = t => {
            requestAnimationFrame(render)
            if (!have_frame) {
                const encoder = this.#device.createCommandEncoder()
                this.#device.queue.submit([encoder.finish()])
                return
            }
            have_frame = false

            if (this.video.videoWidth == 0) return

            let video_time = this.video.currentTime
            try {
                const t0 = performance.now()
                const encoder = this.#device.createCommandEncoder()
                const texture_video = this.#device.importExternalTexture({ source: this.video })
                const texture_canvas = context.getCurrentTexture().createView()

                timer.start(encoder)

                timer.run(this.load, t, video_time, texture_video, this.textureviews[0])

                texture_index = 0
                this.effects.some(e => {
                    if (!e.enabled) return
                    timer.run(e, t, video_time,
                        this.textureviews[texture_index % 2],
                        this.textureviews[(texture_index + 1) % 2])
                    texture_index++
                })

                timer.run(this.upsampler, t, video_time, this.textureviews[texture_index % 2], texture_canvas)

                timer.finish()

                const t2 = performance.now()
                this.#device.queue.submit([encoder.finish()])

                this.#device.queue.onSubmittedWorkDone().then(() => {
                    const t3 = performance.now()
                    totaltime.textContent = (t3 - t0).toFixed(4)
                    queuetime.textContent = (t3 - t2).toFixed(4)
                })

                timer.results().then(({ sum, passes }) => {
                    let txt = ""
                    for (let i = 0; i < passes.length; i++) {
                        txt += `${i} ${passes[i][0]}: ${passes[i][1]}\n`
                    }

                    timing.textContent = txt
                    gputime.textContent = (sum / 1000000).toFixed(4)
                }).catch(() => { })

                const t1 = performance.now()
                jstime.textContent = (t1 - t0).toFixed(4)
                framenumber.textContent = ++frame_n
                txt_fps.textContent = (1000 / (t - last_t)).toFixed(4)
                last_t = t
            }
            catch (e) { console.log(e) }
        }
        requestAnimationFrame(render)
    }

    #prepare_textures(width, height) {
        const texDesc = {
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        }

        this.texturewidth = width
        this.textureheight = height

        this.textures = [
            this.#device.createTexture(texDesc),
            this.#device.createTexture(texDesc)
        ]
        this.textureviews = [
            this.textures[0].createView(),
            this.textures[1].createView(),
        ]
    }

    resize() {
        this.#resizer.resize()
        this.load.resize(this.texturewidth, this.textureheight)
        this.upsampler.resize(this.texturewidth, this.textureheight)
        this.effects.forEach(e => e.resize(this.texturewidth, this.textureheight))
    }

    reload() {
        this.video.requestVideoFrameCallback(async () => {
            await this.loaded

            this.#prepare_textures(this.video.videoWidth, this.video.videoHeight)

            this.resize()
        })
    }
}

const html = `
<div class="grassplayer2">
<input id="chk_split" type="checkbox"></input>
<div class="video-outer"><video controls crossorigin="anonymous"></video></div>
<canvas width="1920" height="1080"></canvas>
<div class="overlay">
    <div class="main">
        <div class="settings">
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
                    <div><span>Resolution</span><span class="videoinfo-resolution"></span></div>
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
                <div><span>Upsampler</span><select class="select-upsamplers"></select></div>
                <div class="upsampler options"></div>
            </div>
            <div>
                <div><span>Downsampler</span><select class="select-downsamplers"></select></div>
                <div class="downsampler options"></div>
            </div>
        </div>
    </div>
    <div class="controls">
        <div class="left">
            <button class="btn-play" state="1"></button>
            <button class="btn-next"></button>
            <input type="range" class="range-volume"/>
        </div>
        <div class="right">
            <button class="btn-settings"></button>
            <button class="btn-fullscreen" state="1"></button>
        </div>
        <div class="seekbar">
        </div>
    </div>
</div>
</div>
`

export default class {
    constructor(root, fonts, controls = true) {
        root.innerHTML = html
        this.video = root.querySelector("video")
        this.renderer = new WebGPURenderer(root)

        {
            const btn_play = root.querySelector(".btn-play")
            this.play = () => {
                btn_play.setAttribute("state", 0)
                this.video.play()
            }
            this.pause = () => {
                btn_play.setAttribute("state", 1)
                this.video.pause()
            }
            btn_play.addEventListener("click", e => {
                const new_state = e.target.getAttribute("state") == 1

                if (new_state) {
                    this.play()
                } else {
                    this.pause()
                }

                if (this.on_toggle_playing != null) {
                    this.on_toggle_playing(new_state)
                } else {
                    this.set_playing(new_state)
                }
            })
        }

        {
            const div = root.querySelector(".videoinfo-resolution")
            this.on_set_video = (type, videos, subtitles) => {
                this.video.requestVideoFrameCallback(() => {
                    div.textContent = `${this.video.videoWidth}x${this.video.videoHeight}`
                })
                // div.textContent = videos.default
            }
        }
    }

    set_speed(s) { }

    set_playing(playing) {
        // if (playing) {
        //     this.video.play()
        // } else {
        //     this.video.pause()
        // }
    }

    duration() {
        return 0
    }

    set_video(type, videos, subtitles) {
        this.on_set_video(type, videos, subtitles)
        this.video.src = videos["default"]
        this.renderer.reload()
    }

    seek(t) { }
}
