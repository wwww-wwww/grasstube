import GrassPlayer from "./grassplayer2/grassplayer2"

const state = { player: null }

function pad(n, width) {
    return n.toString().padStart(width, "0")
}

function seconds_to_hms(seconds, hide_hours = false) {
    seconds = Math.round(seconds)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor(seconds / 60) % 60
    seconds = seconds % 60
    if (hide_hours && hours <= 0) return `${pad(minutes, 2)}:${pad(seconds, 2)}`
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`
}

const video = {
    ping_interval: null,
    latency_rtt: 0,
    last_ping: 0,
    ping() {
        const ping_time = performance.now()
        this.pushEvent("ping", {}, () => {
            this.last_ping = (performance.now() - ping_time)
            this.latency_rtt = this.last_ping * 0.25 + (this.latency_rtt || this.last_ping) * 0.75
            console.log(this.last_ping, this.latency_rtt)
        })
    },
    mounted() {
        const player = new GrassPlayer(this.el)
        state.player = player

        this.handleEvent("video_set", data => {
            player.set_video(data.type, { default: data.video_url }, data.subtitles_url)
        })

        this.handleEvent("video_playing", data => {
            if (data.playing != player.playing()) {
                player.create_message(data.playing ? "Play" : "Pause", 1000)
                player.auto_set_playing(data.playing)
            }
        })

        this.handleEvent("video_time", data => {
            const t = data.time + Math.min(this.latency_rtt / 1000, 1)
            player.create_message(seconds_to_hms(data.time, true), 1000)
            player.auto_seek(t)
            player.set_catchup(t, performance.now())
        })

        this.handleEvent("video_sync", data => {
            const playing = player.playing()

            if (data.playing != playing) {
                player.create_message(data.playing ? "Play" : "Pause", 1000)
                player.auto_set_playing(data.playing)
            }

            if (!data.playing) {
                player.auto_seek(data.time)
                return
            }

            const t = data.time + Math.min(this.latency_rtt / 1000, 1)

            if (t >= player.duration()) return

            const diff = Math.abs(t - player.current_time())
            if (data.playing != playing && diff > 0.1) {
                player.auto_seek(t)
            } else if (diff > 5) {
                player.auto_seek(t)
            }

            player.set_catchup(t, performance.now())
        })

        player.on_buffer_end = buffered => {
            // if (buffered == last_buffered) return
            // last_buffered = buffered
            // this.pushEvent("buffered", { buffered: buffered })
        }

        player.on_toggle_playing = playing => {
            this.pushEvent("video_playing", { playing: playing, offset: -this.latency_rtt / 1000 })
        }

        player.on_seek = t => {
            this.pushEvent("video_seek", { time: t })
        }

        this.ping()
        this.ping_interval = setInterval(() => this.ping(), 2000)
    },
    destroyed() {
        state.player.destroy()
        clearInterval(this.ping_interval)
    },
}

export default { video }
