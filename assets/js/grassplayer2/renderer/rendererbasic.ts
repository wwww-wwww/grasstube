import Renderer from "./renderer"
import SubtitlesOctopus from "../subtitles-octopus2"
import GrassPlayer from "../grassplayer2"

export default class RendererBasic implements Renderer {
    player

    on_buffers?: (buffers: any) => void
    on_buffer_end?: (end: number) => void
    on_timeupdate?: (t: number) => void

    #e_video: HTMLVideoElement
    #e_subtitles: HTMLElement
    #e_videoinfo_catchup: HTMLElement
    constructor(player: GrassPlayer, root: HTMLElement, root_settings: HTMLElement) {
        root.innerHTML = `
<video crossorigin="anonymous"></video>
<div class="subtitles"></div>
`

        root_settings.innerHTML = `
<div>
    <div>Video</div>
    <div class="videoinfo options">
        <div><span>Resolution</span><span class="videoinfo-resolution"></span></div>
        <div><span>Buffered</span><span class="videoinfo-buffered"></span></div>
        <div><span>Catchup</span><span class="videoinfo-catchup"></span></div>
    </div>
</div>
`

        this.player = player
        this.#e_video = root.querySelector("video")!
        this.#e_subtitles = root.querySelector("div.subtitles")!
        this.#e_videoinfo_catchup = root_settings.querySelector(".videoinfo-catchup")!

        {
            const resolution = root_settings.querySelector(".videoinfo-resolution")!
            this.#e_video.addEventListener("loadedmetadata", () => {
                this.on_timeupdate?.(this.current_time())
                resolution.textContent = `${this.#e_video.videoWidth}x${this.#e_video.videoHeight}`
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
    #current_subtitles: any
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
            proxyCanvas: this.#e_video,
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

    set_video(video: string | null, subtitles: string | null) {
        this.set_playing(false)

        this.#e_video.src = video || ""

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
