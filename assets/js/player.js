class Video {
  constructor(player) {
    this.channel = null
    this.player = player
    this.fonts_complete = false
    this.set_video_on_ready = null

    fetch("https://res.cloudinary.com/okea/raw/upload/v1606474226/fonts.json")
      .then(res => res.json())
      .then(fonts => {
        this.player.set_fonts(fonts)
        this.fonts_complete = true
      })
      .catch(err => {
        console.log("fonts: error fetching", err)
      })
      .finally(() => {
        if (this.set_video_on_ready)
          this.player.set_video(this.set_video_on_ready.type, this.set_video_on_ready.videos, this.set_video_on_ready.sub)
      })

    this.player.on_seek = t => {
      this.channel.push("seek", { t: Math.round(t) })
    }

    this.player.on_toggle_playing = playing => {
      this.channel.push(playing ? "play" : "pause")
    }

    this.player.on_next = () => {
      this.channel.push("next")
    }
  }

  connect(socket) {
    console.log("video: connecting to room " + socket.room)
    this.channel = socket.channel("video:" + socket.room, { password: socket.password })

    this.channel.on("setvid", data => {
      console.log("video: setvid", data)
      let videos = {}
      if (data.type == "default") {
        if (data.url.length > 0)
          videos["normal"] = data.url
        console.log(data.alts)
        for (const alt in data.alts) {
          videos[alt] = data.alts[alt]
        }
      } else {
        videos = data.url
      }
      if (!this.fonts_complete) {
        this.set_video_on_ready = { type: data.type, videos: videos, sub: data.sub }
      } else {
        this.player.set_video(data.type, videos, data.sub)
      }
    })

    this.channel.on("playing", data => {
      console.log("video: playing", data)
      this.player.set_playing(data.playing)
    })

    this.channel.on("seek", data => {
      console.log("video: seek", data)
      if (Math.abs(data.t - this.player.current_time()) > 5 && (data.t <= this.player.duration()))
        this.player.seek(data.t)
    })

    this.channel.on("controls", data => {
      console.log("video: controls", data)

      this.player.allow_controls(true)
    })

    this.channel.on("revoke_controls", data => {
      console.log("video: revoke_controls", data)

      this.player.allow_controls(false)
    })

    return this.channel.join()
      .receive("ok", resp => {
        console.log("video: connected", resp)
      })
      .receive("error", resp => {
        console.log("video: failed to connect", resp)
      })
  }
}

export default Video
