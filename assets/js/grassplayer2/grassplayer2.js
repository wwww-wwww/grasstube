import BasicRenderer from "./rendererbasic"
import WebGPURenderer from "./rendererwebgpu"
import YoutubeRenderer from "./rendereryoutube"

import Seekbar, { seconds_to_hms } from "./seekbar"

const html = `
<div class="grassplayer2" tabindex="0">
<div class="view"></div>
<div class="overlay">
    <div class="main">
        <div class="messages"></div>
        <div class="settings" style="display: none;">
            <div><div><div>
                <span>Renderer</span>
                <select class="renderer">
                    <option>WebGPURenderer</option>
                    <option>BasicRenderer</option>
                </select>
            </div></div></div>
        </div>
    </div>
    <div class="controls">
        <div class="left">
            <input type="checkbox" class="chk-play"></input>
            <button class="chk-next"></button>
            <span class="txt-time"></span>
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
    #renderer
    #renderer_view
    #renderer_yt
    #renderer_yt_view
    #seekbar

    #e_main
    #e_messages
    #e_chk_play
    #e_btn_next

    on_toggle_playing = null
    on_seek = null
    on_next = null
    on_buffer_end = null
    constructor(root) {
        window.gp = this
        root.innerHTML = html

        this.#e_main = root.querySelector(".grassplayer2")
        this.#e_messages = root.querySelector(".messages")

        this.#seekbar = new Seekbar(root.querySelector(".seekbar"), this)

        const e_view = root.querySelector(".view")

        const e_txt_time = root.querySelector(".txt-time")

        // Create default renderer
        {
            const renderers = [WebGPURenderer, BasicRenderer]
            const n_renderer = parseInt(this.get_storage("renderer") || 0)

            {
                const select = root.querySelector("select.renderer")
                select.selectedIndex = n_renderer
                select.addEventListener("change", () => {
                    this.set_storage("renderer", select.selectedIndex)
                    window.location.reload()
                })
            }

            this.#renderer_view = document.createElement("div")
            e_view.appendChild(this.#renderer_view)

            const renderer_settings = document.createElement("div")
            root.querySelector(".settings").appendChild(renderer_settings)

            this.#renderer = new renderers[n_renderer](this.#renderer_view, renderer_settings)
            this.#renderer_view.className = this.#renderer.constructor.name
            renderer_settings.className = this.#renderer.constructor.name

            this.#renderer.on_buffer_end = end => this.on_buffer_end(end)
            this.#renderer.on_buffers = buffers =>
                this.#seekbar.set_buffers(buffers, this.duration())
            this.#renderer.on_timeupdate = t => {
                this.#seekbar.set_time(t / this.duration())
                e_txt_time.textContent = `${seconds_to_hms(t, true)} / ${seconds_to_hms(this.duration(), true)}`
            }

            this.#current_renderer = this.#renderer
        }

        {
            this.#renderer_yt_view = document.createElement("div")
            this.#renderer_yt_view.style.display = "none"
            e_view.appendChild(this.#renderer_yt_view)

            const renderer_settings = document.createElement("div")
            root.querySelector(".settings").appendChild(renderer_settings)

            this.#renderer_yt = new YoutubeRenderer(this.#renderer_yt_view, renderer_settings)
            this.#renderer_yt_view.className = this.#renderer_yt.constructor.name
            renderer_settings.className = this.#renderer_yt.constructor.name

            this.#renderer_yt.on_timeupdate = t => {
                this.#seekbar.set_time(t / this.duration())
                e_txt_time.textContent = `${seconds_to_hms(t, true)} / ${seconds_to_hms(this.duration(), true)}`
            }
            this.#renderer_yt.on_buffers = buffers =>
                this.#seekbar.set_buffers(buffers, this.duration())
        }

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

            this.volume_change = v => {
                range_volume.value = v * 100
                range_volume_progress.style.width = `${v * 100}%`
            }

            range_volume.addEventListener("input", () => {
                this.set_volume(range_volume.value / 100)
            })

            this.set_volume((this.get_storage("volume") || 50) / 100)
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
            this.#e_btn_next = root.querySelector(".chk-next")
            this.#e_btn_next.addEventListener("click", () => {
                this.on_next()
            })
        }

        // captions button
        {
            const chk = root.querySelector(".chk-captions")
            chk.addEventListener("input", () => {
                this.#renderer.set_captions(!chk.checked)
                if (this.#renderer_yt != null) {
                    this.#renderer_yt.set_captions(!chk.checked)
                }
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

        // overlay show/hide
        {
            let overlay_timeout = null
            const show_overlay = e => {
                this.#e_main.classList.toggle("show", true)

                if (overlay_timeout != null) {
                    clearTimeout(overlay_timeout)
                }

                if (
                    e != null &&
                    (e.target.closest(".settings") != null || e.target.closest(".controls") != null)
                ) {
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
        }

        // shortcuts
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

            root.addEventListener("dblclick", e => {
                if (e.target.tagName == "INPUT") return
                if (e.target.closest(".settings") != null) return

                e.preventDefault()
                this.#toggle_fullscreen()
            })
        }
    }

    get_storage(name) {
        return window.localStorage.getItem(`${this.constructor.name}-${name}`)
    }

    set_storage(name, value) {
        window.localStorage.setItem(`${this.constructor.name}-${name}`, value)
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

        this.#current_renderer.set_volume((Math.pow(10, v) - 1) / 9)

        this.volume_change(v)

        this.set_storage("volume", v * 100)
    }

    duration() {
        return this.#current_renderer.duration()
    }

    set_speed(s) {
        this.#current_renderer.set_speed(s)
    }

    #current_renderer
    set_video(type, videos, subtitles) {
        if (type == "yt") {
            this.#renderer_view.style.display = "none"
            this.#renderer.set_video({}, "")

            if (this.#renderer_yt != null) {
                this.#renderer_yt_view.style.display = ""
                this.#renderer_yt.set_video(videos)
                this.#current_renderer = this.#renderer_yt
            }
        } else {
            if (this.#renderer_yt != null) {
                this.#renderer_yt_view.style.display = "none"
                this.#renderer_yt.set_video(null)
            }

            this.#renderer_view.style.display = ""
            this.#renderer.set_video(videos, subtitles)
            this.#current_renderer = this.#renderer
        }

        this.set_playing(false)
        this.set_volume(this.#volume)

        this.#seekbar.reset()
    }

    playing() {
        return this.#current_renderer.playing()
    }

    set_playing(playing) {
        this.#e_chk_play.checked = playing

        if (this.playing() == playing) return

        this.#current_renderer.set_playing(playing)
    }

    auto_set_playing(playing) {
        this.set_playing(playing)
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

    current_time() {
        return this.#current_renderer.current_time()
    }

    seek(t, final = false) {
        if (this.duration() == 0) return

        t = Math.max(0, t)

        if (final && this.on_seek) {
            this.on_seek(t)
            return
        }

        this.#current_renderer.seek(t, final)
        if (final) {
            this.create_message(seconds_to_hms(this.current_time(), true), 1000)
        }
    }

    auto_seek(t) {
        if (t == undefined) return
        if (this.#seekbar.seeking) return

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

    set_catchup(target, time) {
        this.#current_renderer.set_catchup(target, time)
    }

    set_controls(b) {
        this.#e_chk_play.disabled = !b
        this.#e_btn_next.disabled = !b
        this.#seekbar.set_enabled(b)
    }
}
