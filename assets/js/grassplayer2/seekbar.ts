import GrassPlayer from "./grassplayer2"

function pad(n: number, width: number) {
    return n.toString().padStart(width, "0")
}

function seconds_to_hms(seconds: number, hide_hours = false) {
    seconds = Math.round(seconds)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor(seconds / 60) % 60
    seconds = seconds % 60
    if (hide_hours && hours <= 0) return `${pad(minutes, 2)}:${pad(seconds, 2)}`
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`
}

export { seconds_to_hms }

export default class Seekbar {
    #root: HTMLElement
    #e_bar: HTMLElement
    #e_current: HTMLElement
    #e_handle: HTMLElement

    #e_handle_info: HTMLElement
    #e_preview_time: HTMLElement
    #e_preview: HTMLCanvasElement

    seeking = false

    #buffers: HTMLElement[] = []
    constructor(root: HTMLElement, player: GrassPlayer) {
        root.innerHTML = `
<div class="seekbar-handle-info">
    <div class="seekbar-preview-time"></div>
    <canvas class="seekbar-preview"></canvas>
</div>
<div class="seekbar-bar">
    <div class="seekbar-bar-current"></div>
</div>
<div class="seekbar-handle"></div>
`

        this.#root = root
        this.#e_bar = root.querySelector(".seekbar-bar")!
        this.#e_current = root.querySelector(".seekbar-bar-current")!
        this.#e_handle = root.querySelector(".seekbar-handle")!

        this.#e_handle_info = root.querySelector(".seekbar-handle-info")!
        this.#e_preview_time = root.querySelector(".seekbar-preview-time")!
        this.#e_preview = root.querySelector(".seekbar-preview")!
        const preview_ctx = this.#e_preview.getContext("2d")

        root.addEventListener("pointerdown", e => {
            if (!this.#enabled) return
            if (e.buttons != 1) return

            e.preventDefault()

            // if (Object.keys(this.current_video.videos).length == 0) return

            this.seeking = true
            root.classList.toggle("seeking", true)

            const playing = player.playing()

            player.set_playing(false)

            const seek = (e: PointerEvent, final = false) => {
                e.preventDefault()

                const rect = root.getBoundingClientRect()
                const t =
                    Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) *
                    player.duration()

                this.set_time(t / player.duration())
                player.seek(t, final)
            }

            const pointerup = (e: PointerEvent) => {
                e.preventDefault()

                document.removeEventListener("pointermove", seek)
                window.removeEventListener("pointerup", pointerup)

                seek(e, true)

                player.set_playing(playing)

                this.seeking = false
                root.classList.toggle("seeking", false)
            }

            document.addEventListener("pointermove", seek)
            window.addEventListener("pointerup", pointerup)

            seek(e)
        })

        root.addEventListener("pointermove", e => {
            if (player.duration() == 0) {
                this.#e_handle_info.style.display = "none"
                return
            }

            this.#e_handle_info.style.display = ""

            const rect = root.getBoundingClientRect()
            const t =
                Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * player.duration()
            const u = t / player.duration()
            this.#e_handle_info.style.left = `${u * 100}%`
            this.#e_preview_time.textContent = seconds_to_hms(t, true)

            /*
            if (this.previews.length == 0) return

            const preview_rect = seekbar.preview.getBoundingClientRect()
            const preview_width = preview_rect.width / rect.width / 2
            const preview_pct = Math.min(Math.max(pct, preview_width), 1 - preview_width)
            seekbar.preview.style.left = `${preview_pct * 100}%`

            const max_width = parseInt(window.getComputedStyle(seekbar.preview).maxWidth)
            const max_height = parseInt(window.getComputedStyle(seekbar.preview).maxHeight)

            const url = this.previews[Math.floor(t / this.previews_interval)]
            if (url == undefined) return

            preview_ctx.drawImage(url, 0, 0, seekbar.preview.width, seekbar.preview.height)
            */
        })
    }

    set_buffers(buffers: any, duration: number) {
        while (this.#buffers.length < buffers.length) {
            const buffer = document.createElement("div")
            buffer.style.width = "0%"
            this.#e_bar.appendChild(buffer)
            this.#buffers.push(buffer)
        }

        while (this.#buffers.length > buffers.length) {
            const buffer = this.#buffers.pop()!
            this.#e_bar.removeChild(buffer)
        }

        for (let i = 0; i < buffers.length; i++) {
            const start = buffers.start(i) / duration
            let end = buffers.end(i) / duration
            if (end > 0.999) end = 1
            this.#buffers[i].style.left = start * 100 + "%"
            this.#buffers[i].style.width = (end - start) * 100 + "%"
        }
    }

    set_time(u: number) {
        this.#e_current.style.width = u * 100 + "%"
        this.#e_handle.style.left = u * 100 + "%"
    }

    reset() {
        this.set_time(0)
        this.set_buffers([], 0)
    }

    #enabled = true
    set_enabled(b: boolean) {
        this.#enabled = b
        this.#root.classList.toggle("disabled", !b)
    }
}
