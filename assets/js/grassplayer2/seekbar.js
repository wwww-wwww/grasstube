export default class Seekbar {
    #e_bar
    #e_current
    #e_dial
    #e_time
    #e_preview

    #buffers = []
    constructor(root, video) {
        root.innerHTML = `
<div class="seekbar-time"></div>
<canvas class="seekbar-preview"></canvas>
<div class="seekbar-bar">
    <div class="seekbar-bar-current"></div>
</div>
<div class="seekbar-dial"></div>
`

        this.#e_bar = root.querySelector(".seekbar-bar")
        this.#e_current = root.querySelector(".seekbar-bar-current")
        this.#e_dial = root.querySelector(".seekbar-dial")
        this.#e_time = root.querySelector(".seekbar-time")

        this.#e_preview = root.querySelector(".seekbar-preview")
        const preview_ctx = this.#e_preview.getContext("2d")

        video.addEventListener("progress", () => {
            this.#set_buffers(video.buffered, video.duration)
        })

        video.addEventListener("timeupdate", () => {
            this.#set_time((video.currentTime || 0) / video.duration)
        })

        root.addEventListener("mousedown", e => {
            if (e.buttons != 1) return
            e.preventDefault()

            // if (Object.keys(this.current_video.videos).length == 0) return

            video.pause()

            // body.addEventListener("mousemove", seek)
            // window.addEventListener("mouseup", mouseup)

            // this.seeking = true
            // this.seeking_playing = this.playing

            // seek(e)
            // this.seekbar.graphic.classList.toggle("seeking", true)
            // this.seekbar.dial.classList.toggle("seeking", true)
        })

        /*
        this.#_seek = (e, seek = true) => {
            e.preventDefault()
            const rect = this.seekbar.getBoundingClientRect()
            const t = Math.min(Math.max(((e.clientX - rect.left) / (rect.width)), 0), 1) * this.duration()
            if (seek) this.seek_to(t)
            return t
        }

        const seek = e => { return this.#_seek(e) }
        const mouseup = e => {
            e.preventDefault()
            this.seeking = false

            if (Object.keys(this.current_video.videos).length == 0) return

            body.removeEventListener("mousemove", seek)
            window.removeEventListener("mouseup", this.seekbar._mouseup)

            if (this.seeking_playing) { this.play() }

            this.on_seek(this.#_seek(e, false))

            this.seekbar.graphic.classList.toggle("seeking", false)
            this.seekbar.dial.classList.toggle("seeking", false)
            if (this.overlay_hide) { clearTimeout(this.overlay_hide) }
            this.overlay.classList.toggle("overlay_hidden", false)
            this.overlay_hide = setTimeout(() => {
                this.overlay.classList.toggle("overlay_hidden", true)
            }, 2000)
        }


        seekbar.addEventListener("mousemove", e => {
            if (!this.current_video.yt && Object.keys(this.current_video.videos).length == 0) {
                mtime.textContent = ""
                return
            }
            const rect = this.seekbar.getBoundingClientRect()
            let pct = Math.min(Math.max(((e.clientX - rect.left) / (rect.width)), 0), 1)
            const t = pct * this.duration()
            mtime.textContent = seconds_to_hms(t, true)

            const mtime_rect = mtime.getBoundingClientRect()
            const mtime_width = mtime_rect.width / rect.width / 2
            const mtime_pct = Math.min(Math.max(pct, mtime_width), 1 - mtime_width)
            mtime.style.left = `${mtime_pct * 100}%`

            if (this.previews.length == 0) return

            const preview_rect = seekbar.preview.getBoundingClientRect()
            const preview_width = preview_rect.width / rect.width / 2
            const preview_pct = Math.min(Math.max(pct, preview_width), 1 - preview_width)
            seekbar.preview.style.left = `${preview_pct * 100}%`

            const max_width = parseInt(window.getComputedStyle(seekbar.preview).maxWidth)
            const max_height = parseInt(window.getComputedStyle(seekbar.preview).maxHeight)

            const url = this.previews[Math.floor(t / this.previews_interval)]
            if (url == undefined) return

            const img_w = url.naturalWidth
            const img_h = url.naturalHeight
            const img_r = img_w / img_h

            if (img_r * max_height < max_width) {
                seekbar.preview.width = img_r * max_height
                seekbar.preview.height = max_height
            } else {
                seekbar.preview.width = max_width
                seekbar.preview.height = (img_w / img_w) * max_width
            }

            preview_ctx.drawImage(url, 0, 0, seekbar.preview.width, seekbar.preview.height)
        })*/
    }

    #set_buffers(buffers, duration) {
        console.log(buffers)
        while (this.#buffers.length < buffers.length) {
            const buffer = document.createElement("div")
            buffer.style.width = "0%"
            this.#e_bar.appendChild(buffer)
            this.#buffers.push(buffer)
        }

        while (this.#buffers.length > buffers.length) {
            const buffer = this.#buffers.pop()
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

    #set_time(t) {
        this.#e_current.style.width = t * 100 + "%"
        this.#e_dial.style.left = t * 100 + "%"
    }
}

