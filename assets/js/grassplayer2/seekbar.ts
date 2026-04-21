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
    private root: HTMLElement
    private e_bar: HTMLElement
    private e_current: HTMLElement
    private e_handle: HTMLElement

    private e_handle_info: HTMLElement
    private e_preview_time: HTMLElement
    private e_preview: HTMLCanvasElement

    seeking = false

    private buffers: HTMLElement[] = []
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

        this.root = root
        this.e_bar = root.querySelector(".seekbar-bar")!
        this.e_current = root.querySelector(".seekbar-bar-current")!
        this.e_handle = root.querySelector(".seekbar-handle")!

        this.e_handle_info = root.querySelector(".seekbar-handle-info")!
        this.e_preview_time = root.querySelector(".seekbar-preview-time")!
        this.e_preview = root.querySelector(".seekbar-preview")!
        const preview_ctx = this.e_preview.getContext("2d")!

        const seek = (e: PointerEvent, final = false) => {
            if (!this.seeking) return
            e.preventDefault()

            const rect = root.getBoundingClientRect()
            const t =
                Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * player.duration()

            this.set_time(t / player.duration())
            player.seek(t, final)
        }

        let playing = false
        root.addEventListener("pointerdown", e => {
            if (!this.enabled) return
            if (e.buttons != 1) return
            e.preventDefault()
            root.setPointerCapture(e.pointerId)

            this.seeking = true
            root.classList.toggle("seeking", true)

            playing = player.playing()

            player.set_playing(false)

            seek(e)
        })

        root.addEventListener("pointerup", (e: PointerEvent) => {
            if (!root.hasPointerCapture(e.pointerId)) return
            root.releasePointerCapture(e.pointerId)

            seek(e, true)

            player.set_playing(playing)

            this.seeking = false
            root.classList.toggle("seeking", false)
        })

        root.addEventListener("pointermove", seek)

        let preview: HTMLImageElement | null = null

        root.addEventListener("pointermove", e => {
            if (player.duration() == 0) {
                this.e_handle_info.style.display = "none"
                return
            }

            this.e_handle_info.style.display = ""

            const rect = root.getBoundingClientRect()
            const t =
                Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * player.duration()
            const u = t / player.duration()
            this.e_handle_info.style.left = `${u * 100}%`
            this.e_preview_time.textContent = seconds_to_hms(t, true)

            if (!this.previews.length) return

            const new_preview = this.previews[Math.floor(t / this.previews_interval)]

            if (!new_preview) return
            if (new_preview == preview) return

            preview = new_preview

            this.e_preview.width = preview.width
            this.e_preview.height = preview.height

            preview_ctx.drawImage(preview, 0, 0, preview.width, preview.height)
        })
    }

    set_buffers(buffers: any, duration: number) {
        while (this.buffers.length < buffers.length) {
            const buffer = document.createElement("div")
            buffer.style.width = "0%"
            this.e_bar.appendChild(buffer)
            this.buffers.push(buffer)
        }

        while (this.buffers.length > buffers.length) {
            const buffer = this.buffers.pop()!
            this.e_bar.removeChild(buffer)
        }

        for (let i = 0; i < buffers.length; i++) {
            const start = buffers.start(i) / duration
            let end = buffers.end(i) / duration
            if (end > 0.999) end = 1
            this.buffers[i].style.left = start * 100 + "%"
            this.buffers[i].style.width = (end - start) * 100 + "%"
        }
    }

    set_time(u: number) {
        this.e_current.style.width = u * 100 + "%"
        this.e_handle.style.left = u * 100 + "%"
    }

    reset() {
        this.e_preview.classList.toggle("visible", false)
        this.set_time(0)
        this.set_buffers([], 0)
    }

    private enabled = true
    set_enabled(b: boolean) {
        this.enabled = b
        this.root.classList.toggle("disabled", !b)
    }

    private previews: HTMLImageElement[] = []
    private previews_interval = 0
    load_previews(video_url: string) {
        const filename = video_url.slice(0, video_url.lastIndexOf(".")) + ".thumb"
        fetch(filename, { method: "GET", mode: "cors" })
            .then(resp => resp.arrayBuffer())
            .then(buffer => {
                const n_frames = new Uint32Array(buffer.slice(0, 4))[0]
                const last_frame = new Float32Array(buffer.slice(4, 8))[0]

                const mime_type = Array.from(new Uint8Array(buffer.slice(8, 40)))
                    .map(x => String.fromCharCode(x))
                    .join("")

                const interval = last_frame / (n_frames - 1)
                this.previews = []
                this.previews_interval = interval

                let head = 40
                for (let i = 0; i < n_frames; i++) {
                    const size = new Uint32Array(buffer.slice(head, head + 4))[0]
                    head += 4

                    const base64 = Array.from(new Uint8Array(buffer.slice(head, head + size)))
                        .map(x => String.fromCharCode(x))
                        .join("")

                    const img = new Image()
                    img.src = `data:${mime_type};base64,${btoa(base64)}`
                    this.previews.push(img)

                    head += size
                }

                this.e_preview.classList.toggle("visible", true)
            })
    }
}
