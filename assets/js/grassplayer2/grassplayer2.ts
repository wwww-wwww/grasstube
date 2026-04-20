import RendererBasic from "./renderer/rendererbasic"
import RendererWebGPU from "./renderer/rendererwebgpu"
import RendererYoutube from "./renderer/rendereryoutube"
import Renderer from "./renderer/renderer"

import Seekbar, { seconds_to_hms } from "./seekbar"

const html = `
<div class="view"></div>
<div class="overlay">
    <div class="autoplay-block"><span>Click to unmute</span></div>
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
`

export default class GrassPlayer {
    private current_renderer: Renderer
    private renderer: Renderer
    private renderer_view: HTMLElement
    private renderer_yt: RendererYoutube | null = null
    private renderer_yt_view: HTMLElement
    private seekbar: Seekbar

    fullscreen_element: HTMLElement
    private e_main: HTMLElement
    private e_messages: HTMLElement
    private e_chk_play: HTMLInputElement
    private e_btn_next: HTMLButtonElement
    private e_txt_time: HTMLElement

    private events_fullscreenchange: any
    private events_keydown: any

    on_toggle_playing: ((b: boolean) => void) | null = null
    on_seek: ((t: number) => void) | null = null
    on_next: (() => void) | null = null
    on_buffer_end: ((end: number) => void) | null = null

    constructor(root: Element) {
        const el = document.createElement("div")
        el.className = "grassplayer2"
        el.tabIndex = 0
        el.innerHTML = html
        root.appendChild(el)

        this.e_main = el
        this.fullscreen_element = el
        this.e_messages = el.querySelector(".messages")!

        this.seekbar = new Seekbar(el.querySelector(".seekbar")!, this)

        const e_view: HTMLElement = el.querySelector(".view")!

        this.e_txt_time = el.querySelector(".txt-time")!

        // Create default renderer
        {
            const renderers = [RendererWebGPU, RendererBasic]
            const n_renderer = parseInt(this.get_storage("renderer") || "0")

            {
                const select: HTMLSelectElement = el.querySelector("select.renderer")!
                select.selectedIndex = n_renderer
                select.addEventListener("change", () => {
                    this.set_storage("renderer", select.selectedIndex)
                    window.location.reload()
                })
            }

            this.renderer_view = document.createElement("div")
            e_view.appendChild(this.renderer_view)

            const renderer_settings = document.createElement("div")
            el.querySelector(".settings")!.appendChild(renderer_settings)

            this.renderer = new renderers[n_renderer](this, this.renderer_view, renderer_settings)
            this.renderer_view.className = this.renderer.constructor.name
            renderer_settings.className = this.renderer.constructor.name

            this.renderer.on_buffer_end = (end: number) => {
                if (this.current_renderer != this.renderer) return
                this.on_buffer_end?.(end)
            }
            this.renderer.on_buffers = (buffers: any) => {
                if (this.current_renderer != this.renderer) return
                this.seekbar.set_buffers(buffers, this.duration())
            }
            this.renderer.on_timeupdate = (t: number) => {
                if (this.current_renderer != this.renderer) return
                this.seekbar.set_time(t / this.duration())
                this.e_txt_time.textContent = `${seconds_to_hms(t, true)} / ${seconds_to_hms(this.duration(), true)}`
            }

            this.current_renderer = this.renderer
        }

        {
            this.renderer_yt_view = document.createElement("div")
            this.renderer_yt_view.style.display = "none"
            e_view.appendChild(this.renderer_yt_view)

            const renderer_settings = document.createElement("div")
            el.querySelector(".settings")!.appendChild(renderer_settings)

            this.renderer_yt = new RendererYoutube(this, this.renderer_yt_view, renderer_settings)
            this.renderer_yt_view.className = this.renderer_yt.constructor.name
            renderer_settings.className = this.renderer_yt.constructor.name

            this.renderer_yt.on_buffer_end = (end: number) => {
                if (this.current_renderer != this.renderer_yt) return
                this.on_buffer_end?.(end)
            }
            this.renderer_yt.on_buffers = buffers => {
                if (this.current_renderer != this.renderer_yt) return
                this.seekbar.set_buffers(buffers, this.duration())
            }
            this.renderer_yt.on_timeupdate = t => {
                if (this.current_renderer != this.renderer_yt) return
                this.seekbar.set_time(t / this.duration())
                this.e_txt_time.textContent = `${seconds_to_hms(t, true)} / ${seconds_to_hms(this.duration(), true)}`
            }
        }

        // Check autoplay
        {
            const autoplay_blocker: HTMLElement = el.querySelector(".autoplay-block")!
            autoplay_blocker.style.display = "none"

            document
                .createElement("video")
                .play()
                .catch(_ => {
                    autoplay_blocker.style.display = ""
                    this.renderer.set_muted(true)
                    this.renderer_yt?.set_muted(true)

                    autoplay_blocker.addEventListener("click", () => {
                        autoplay_blocker.style.display = "none"
                        this.renderer.set_muted(false)
                        this.renderer_yt?.set_muted(false)
                    })
                })
        }

        // play button
        {
            this.e_chk_play = el.querySelector(".chk-play")!
            this.e_chk_play.addEventListener("change", () => {
                const playing = this.e_chk_play.checked

                this.toggle_playing(playing)
            })
        }

        // volume slider
        {
            const range_volume: HTMLInputElement = el.querySelector(".range-volume")!
            const range_volume_progress: HTMLElement = el.querySelector(
                ".range-volume-progress-track",
            )!

            this.volume_change = (v: number) => {
                range_volume.value = (v * 100).toString()
                range_volume_progress.style.width = `${v * 100}%`
            }

            range_volume.addEventListener("input", () => {
                this.set_volume(parseFloat(range_volume.value) / 100)
            })

            this.set_volume(parseFloat(this.get_storage("volume") || "50") / 100)
        }

        // settings button
        {
            const chk: HTMLInputElement = el.querySelector(".chk-settings")!
            const e_settings: HTMLElement = el.querySelector(".settings")!
            chk.addEventListener("change", () => {
                e_settings.style.display = chk.checked ? "" : "none"
            })
        }

        // next button
        {
            this.e_btn_next = el.querySelector(".chk-next")!
            this.e_btn_next.addEventListener("click", () => {
                this.on_next?.()
            })
        }

        // captions button
        {
            const chk: HTMLInputElement = el.querySelector(".chk-captions")!
            chk.addEventListener("input", () => {
                this.renderer.set_captions(!chk.checked)
                this.renderer_yt?.set_captions(!chk.checked)
            })
        }

        // fullscreen button
        {
            const chk: HTMLInputElement = el.querySelector(".chk-fullscreen")!
            chk.addEventListener("input", () => {
                this.toggle_fullscreen()
            })
            this.events_fullscreenchange = () => {
                chk.checked = document.fullscreenElement == this.fullscreen_element
            }
            document.addEventListener("fullscreenchange", this.events_fullscreenchange)
        }

        // overlay show/hide
        {
            let overlay_timeout: any = null
            const show_overlay = (e: PointerEvent) => {
                this.e_main.classList.toggle("show", true)

                if (overlay_timeout != null) {
                    clearTimeout(overlay_timeout)
                }

                if (
                    e != null &&
                    ((e.target as HTMLElement).closest(".settings") != null ||
                        (e.target as HTMLElement).closest(".controls") != null)
                ) {
                    return
                }

                overlay_timeout = setTimeout(() => {
                    this.e_main.classList.toggle("show", false)
                }, 2000)
            }

            this.e_main.addEventListener("pointerdown", show_overlay)
            this.e_main.addEventListener("pointermove", show_overlay)

            this.e_main.addEventListener("mouseleave", () => {
                this.e_main.classList.toggle("show", false)
            })
        }

        // shortcuts
        {
            this.events_keydown = (e: KeyboardEvent) => {
                if (
                    document.activeElement?.tagName == "INPUT" ||
                    document.activeElement?.tagName == "BUTTON"
                )
                    return
                if (document.activeElement?.closest(".grassplayer2") == null) return

                if (e.key == "f") {
                    this.toggle_fullscreen()
                } else if (e.key == "ArrowLeft") {
                    if (!this.controls) return
                    e.preventDefault()
                    this.seek(this.current_time() - 5, true)
                } else if (e.key == "ArrowRight") {
                    if (!this.controls) return
                    e.preventDefault()
                    this.seek(this.current_time() + 5, true)
                } else if (e.key == "ArrowUp") {
                    e.preventDefault()
                    this.set_volume(this.volume + 0.1)
                    const m = this.create_message(Math.round(this.volume * 100), 1000)
                    m.classList.toggle("volume-up")
                } else if (e.key == "ArrowDown") {
                    e.preventDefault()
                    this.set_volume(this.volume - 0.1)
                    const m = this.create_message(Math.round(this.volume * 100), 1000)
                    m.classList.toggle("volume-down")
                } else if (e.key == " ") {
                    if (!this.controls) return
                    e.preventDefault()
                    this.toggle_playing(!this.playing())
                }
            }
            window.addEventListener("keydown", this.events_keydown)

            el.addEventListener("dblclick", e => {
                if ((e.target as HTMLElement).tagName == "INPUT") return
                if ((e.target as HTMLElement).tagName == "BUTTON") return
                if ((e.target as HTMLElement).closest(".settings") != null) return

                e.preventDefault()
                this.toggle_fullscreen()
            })
        }
    }

    destroy() {
        window.removeEventListener("keydown", this.events_keydown)
        document.removeEventListener("fullscreenchange", this.events_fullscreenchange)
    }

    get_storage(name: string): string | null {
        return window.localStorage.getItem(`${this.constructor.name}-${name}`)
    }

    set_storage(name: string, value: string | number) {
        window.localStorage.setItem(`${this.constructor.name}-${name}`, value.toString())
    }

    create_message(message: string | number, timeout: number = 0) {
        const el = document.createElement("div")
        el.className = "message"
        el.innerHTML = message.toString()
        el.addEventListener("click", () => {
            this.e_messages.removeChild(el)
        })

        this.e_messages.appendChild(el)
        if (timeout > 0) {
            setTimeout(() => {
                if (el.parentElement == this.e_messages) {
                    this.e_messages.removeChild(el)
                }
            }, timeout)
        }
        return el
    }

    volume_change
    private volume = 0.5
    set_volume(v: number) {
        v = Math.min(Math.max(v, 0), 1)
        v = Math.round(v * 100) / 100

        this.volume = v

        this.current_renderer.set_volume((Math.pow(10, v) - 1) / 9)

        this.volume_change(v)

        this.set_storage("volume", v * 100)
    }

    duration() {
        return this.current_renderer.duration()
    }

    set_speed(s: number) {
        this.current_renderer.set_speed(s)
    }

    set_video(type: string, video: string, subtitles: string) {
        this.e_txt_time.textContent = ""
        this.set_playing(false)
        this.on_buffer_end?.(0)

        if (type == "youtube") {
            this.renderer_view.style.display = "none"
            this.renderer.set_video(null, null)

            this.renderer_yt_view.style.display = ""
            this.renderer_yt?.set_video(video)

            if (this.renderer_yt != null) {
                this.current_renderer = this.renderer_yt
            }
        } else {
            this.renderer_yt_view.style.display = "none"
            this.renderer_yt?.set_video(null)

            this.renderer_view.style.display = ""
            this.renderer.set_video(video, subtitles)
            this.current_renderer = this.renderer
        }

        this.set_volume(this.volume)

        this.seekbar.reset()
    }

    playing() {
        return this.current_renderer.playing()
    }

    set_playing(playing: boolean) {
        this.e_chk_play.checked = playing

        if (this.playing() == playing) return

        this.current_renderer.set_playing(playing)
    }

    auto_set_playing(playing: boolean) {
        this.set_playing(playing)
    }

    toggle_playing(playing: boolean) {
        if (this.on_toggle_playing != null) {
            this.on_toggle_playing(playing)
        } else {
            this.set_playing(playing)
        }
    }

    current_time() {
        return this.current_renderer.current_time()
    }

    seek(t: number, final = false) {
        if (this.duration() == 0) return

        t = Math.max(0, t)

        if (final && this.on_seek) {
            this.on_seek(t)
            return
        }

        if (t >= this.duration()) return

        this.current_renderer.seek(t, final)
        if (final) {
            this.create_message(seconds_to_hms(this.current_time(), true), 1000)
        }
    }

    auto_seek(t: number) {
        if (t == undefined) return
        if (this.seekbar.seeking) return

        this.seek(t)
    }

    private toggle_fullscreen() {
        if (document.fullscreenElement == this.fullscreen_element) {
            document.exitFullscreen()
        } else {
            this.fullscreen_element.requestFullscreen()
        }
    }

    set_catchup(target: number, time: number) {
        this.current_renderer.set_catchup(target, time)
    }

    private controls = true
    set_controls(b: boolean) {
        this.controls = b
        this.e_chk_play.disabled = !b
        this.e_btn_next.disabled = !b
        this.seekbar.set_enabled(b)
    }
}
