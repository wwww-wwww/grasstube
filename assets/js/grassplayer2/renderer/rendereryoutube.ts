import GrassPlayer from "../grassplayer2"
import Renderer from "./renderer"

export default class RendererYoutube implements Renderer {
    player

    #e_video
    #e_videoinfo_catchup

    on_buffers?: (buffers: any) => void
    on_buffer_end?: (end: number) => void
    on_timeupdate?: (t: number) => void

    constructor(player: GrassPlayer, root: HTMLElement, root_settings: HTMLElement) {
        root.innerHTML = `<div class="youtube"></div>`

        root_settings.innerHTML = `
<div>
    <div>Youtube</div>
    <div class="videoinfo options">
        <div><span>Buffered</span><span class="videoinfo-buffered"></span></div>
        <div><span>Catchup</span><span class="videoinfo-catchup"></span></div>
    </div>
</div>
`

        this.player = player
        this.#e_video = root.querySelector(".youtube")!
        this.#e_videoinfo_catchup = root_settings.querySelector(".videoinfo-catchup")!

        // @ts-ignore
        window.onYouTubeIframeAPIReady = () => {
            // @ts-ignore
            if (YT.loaded != 1) {
                console.error("Unable to load youtube iframe api")
                return
            }
            // @ts-ignore
            const player = new YT.Player(this.#e_video, {
                width: "100%",
                height: "100%",
                playerVars: { controls: 0, autoplay: 0, cc_lang_pref: "en" },
                events: {
                    onReady: () => {
                        this.#player = player
                        this.set_video(this.#video_id)
                    },
                    onStateChange: (e: any) => {
                        if (e.data == -1) {
                            this.set_speed(this.#speed)
                            this.set_playing(this.#playing)
                            this.set_volume(this.#volume)
                            if (this.#seek) {
                                player.seekTo(this.#seek + (performance.now() - this.#seek_time))
                            }
                        }
                        if (e.data == 1 && !this.#playing) {
                            player.pauseVideo()
                        }
                    },
                    onApiChange: (e: any) => {
                        const options = e.target.getOptions()
                        options.forEach((option: any) => {
                            if (option == "captions" || option == "cc") {
                                e.target.setOption(option, "reload", true)

                                if (this.#captions) {
                                    player.loadModule(option)
                                } else {
                                    player.unloadModule(option)
                                }
                            }
                        })
                    },
                },
            })
        }

        const s = document.createElement("script")
        s.src = "https://www.youtube.com/iframe_api"
        document.head.appendChild(s)

        this.#e_video = root.querySelector(".youtube")!
        this.#e_videoinfo_catchup = root_settings.querySelector(".videoinfo-catchup")!

        const buffered = root_settings.querySelector(".videoinfo-buffered")!
        const update_buffer = () => {
            if (this.#player != null) {
                if (this.#player.getDuration() == 0) return

                const t: number = this.#player.getVideoLoadedFraction()
                this.on_buffers?.({ start: () => 0, end: () => t * this.duration(), length: 1 })
                this.on_timeupdate?.(this.current_time())
                buffered.textContent = `${Math.round(t * this.duration() - this.current_time()) || 0} seconds`
            }
        }
        setInterval(update_buffer, 500)
    }

    #video_id: string | null = null
    #player: any = null
    set_video(video_id: string | null) {
        this.set_playing(false)
        this.#video_id = video_id

        if (this.#player == null) return

        this.#player.stopVideo()

        if (video_id == null || video_id.length == 0) return

        this.#player.loadVideoById(video_id)
    }

    #volume = 0
    set_volume(v: number) {
        this.#volume = v

        if (this.#player == null) return
        this.#player.setVolume(this.#volume * 100)
    }

    #captions: boolean = false
    set_captions(b: boolean) {
        this.#captions = b
    }

    playing() {
        if (this.#player == null) return false
        return this.#player.getPlayerState() == 1
    }

    duration() {
        if (this.#player == null) return 0
        return this.#player.getDuration()
    }

    #speed = 1
    set_speed(s: number) {
        this.#speed = s
        this.#set_speed(s)
    }

    #set_speed(s: number) {
        if (this.#player == null) return
        this.#player.setPlaybackRate(s)
    }

    #playing = false
    set_playing(playing: boolean) {
        this.#playing = playing

        if (this.playing() == playing) return

        this.#catchup_done = false

        if (this.#player == null) return

        if (playing) {
            if (this.current_time() >= this.duration()) return
            this.#player.playVideo()
        } else {
            this.#player.pauseVideo()
        }
    }

    current_time() {
        if (this.#player == null) return 0
        return this.#player.getCurrentTime()
    }

    #seek = 0
    #seek_time = 0
    seek(t: number, final = false) {
        this.#seek_time = performance.now()
        this.#seek = t

        this.#catchup_done = false

        if (this.#player == null) return

        this.#player.seekTo(t)
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
        let catchup_mul = 1 + dir * (dist > 0.5 ? 0.05 : 0.05)

        if (Math.abs(dist) < 0.02) {
            this.#catchup_done = true
            catchup_mul = 1
            clearInterval(this.#catchup_interval)
        }

        this.#set_speed(this.#speed * catchup_mul)

        this.#e_videoinfo_catchup.textContent = `${dist.toFixed(5)} ${catchup_mul.toFixed(5)}x`
    }
}
