import css from "../css/player.css"
import {seconds_to_hms, create_element} from "./util"
import {get_cookie, set_cookie} from "./cookies"
import Modal from "./modals"

class GrassPlayer {

  constructor(root, fonts=[], controls=true) {
    this.fonts = fonts

    /*const test_autoplay = document.createElement("video").play()
    if (test_autoplay != undefined) {
      test_autoplay.catch(_ => {
        new Modal({title: "this is for autoplay", root: attach}).show()
      })
    } else {
      new Modal({title: "this is for autoplay", root: attach}).show()
    }*/

    const yt = create_element(document.head, "script")
    yt.src = "https://www.youtube.com/iframe_api"
    window.onYouTubeIframeAPIReady = () => {
      this.yt_loaded = YT.loaded
      if (YT.loaded == 1) {
        if (typeof(this.current_video.yt) == "string") {
          this.set_youtube(this.current_video.yt)
        }
      }
    }

    this.current_video = {}
    this.current_video.videos = {}
    this.current_video.subs = ""
    this.current_video.yt = null

    this.playing = false
    
    this.settings = {}
    this.settings.default_quality = get_cookie("video_quality") || "big"
    this.settings.volume = (Math.pow(10, (get_cookie("video_volume") || 20) / 100) - 1) / 9

    this.video = create_element(root, "video", "player_video")
    this.video.id = "video"
    this.video.volume = this.settings.volume

    this.video2 = create_element(root, "div", "player_video")
    this.video2.id = "video2"

    this.overlay = create_element(root, "div", "player_overlay player_overlay_hidden")
    
    this.octopusInstance = new SubtitlesOctopus({
      video: this.video,
      subUrl: "/empty.ass",
      fonts: fonts,
      workerUrl: "/includes/subtitles-octopus-worker.js"
    })

    const bottom_shade = create_element(this.overlay, "div")
    bottom_shade.style.position = "absolute"
    bottom_shade.style.width = "100%"
    bottom_shade.style.height = "3em"
    bottom_shade.style.bottom = "0"
    bottom_shade.style.background = "rgba(0, 0, 0, 0.5)"

    this.btn_play = create_element(bottom_shade, "button", "player_btn")
    this.btn_play.textContent = "▶"
    this.btn_play.disabled = true

    this.btn_play.addEventListener("click", () => {
      const playing = this.btn_play.textContent == "▶"
      if (playing) {
        this.btn_play.textContent = "❚❚"
      } else {
        this.btn_play.textContent = "▶"
      }
      if (this.on_toggle_playing != null) {
        this.on_toggle_playing(playing)
      } else {
        this.set_playing(playing)
      }
    })
    
    this.btn_next = create_element(bottom_shade, "button", "player_btn")
    this.btn_next.style.fontSize = "1em"
    this.btn_next.textContent = "▶❙"

    this.on_next = void 0
    this.btn_next.addEventListener("click", () => {
      this.on_next()
    })

    this.slider_volume = create_element(bottom_shade, "input", "player_volume")
    this.slider_volume.type = "range"
    this.slider_volume.min = 0
    this.slider_volume.max = 100
    this.slider_volume.step = 1
    this.slider_volume.value = (get_cookie("video_volume") || 20)

    this.slider_volume.addEventListener("input", () => {
      set_cookie("video_volume", this.slider_volume.value)
      this.settings.volume = (Math.pow(10, this.slider_volume.value / 100) - 1) / 9
      if (this.current_video.yt) this.current_video.yt.setVolume(this.settings.volume * 100)
      this.video.volume = this.settings.volume
    })

    this.lbl_time = create_element(bottom_shade, "span", "player_time")
    this.lbl_time.textContent = "00:00 / 00:00"

    const right_side = create_element(bottom_shade, "div")
    right_side.style.float = "right"

    this.btn_cc = create_element(right_side, "button", "player_btn player_btn_cc")

    const _cc = get_cookie("video_cc")
    if (_cc == null) this.btn_cc.checked = true
    else this.btn_cc.checked = _cc

    this.btn_cc.classList.toggle("player_btn_toggle_on", this.btn_cc.checked)

    this.btn_cc.textContent = "CC"

    this.btn_cc.addEventListener("click", () => {
      this.btn_cc.checked = !this.btn_cc.checked
      this.btn_cc.classList.toggle("player_btn_toggle_on", this.btn_cc.checked)
      set_cookie("video_cc", this.btn_cc.checked)
      if (this.current_video.yt) {
        const options = this.current_video.yt.getOptions()

        options.forEach(option => {
          if (option == "captions" || option == "cc")
            if (this.btn_cc.checked)
              this.current_video.yt.loadModule(option)
            else
              this.current_video.yt.unloadModule(option)
        })
        this.octopusInstance.freeTrack()
      } else {
        if (this.btn_cc.checked) {
          if (this.current_video.subs.length > 0)
            this.octopusInstance.setTrackByUrl(this.current_video.subs)
        } else {
          this.octopusInstance.freeTrack()
        }
      }
    })

    this.select_quality = create_element(right_side, "select", "player_select_quality")
    this.select_quality.style.display = "none"

    this.select_quality.addEventListener("change", () => {
      this.video.src = this.current_video.videos[this.select_quality.value]
      set_cookie("video_quality", this.select_quality.value)
    })

    this.btn_fullscreen = create_element(right_side, "button", "player_btn")
    this.btn_fullscreen.textContent = "⛶"
    
    this.btn_fullscreen.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen()
      else root.requestFullscreen()
    })

    this.on_toggle_playing = null
    this.on_seek = () => void 0
    create_seekbar(this, true)

    this.video.addEventListener("progress", () => {
      this.seekbar.set_buffers((this.video.buffered), this.video.duration)
    })

    this.video.addEventListener("timeupdate", () => {
      this.seekbar.set_time((this.video.currentTime || 0) / this.video.duration)
      this.seekbar.set_buffers((this.video.buffered), this.video.duration)
      if (this.video.duration > 0)
        this.lbl_time.textContent = `${seconds_to_hms(this.video.currentTime, true)} / ${seconds_to_hms(this.video.duration, true)}`
      else
        this.lbl_time.textContent = "00:00 / 00:00"
    })

    this.video.addEventListener("play", () => {
      this.btn_play.textContent = "❚❚"
    })

    this.video.addEventListener("pause", () => {
      this.btn_play.textContent = "▶"
    })

    this.overlay_hide = null

    this.overlay.addEventListener("mousemove", () => {
      this.overlay.classList.toggle("player_overlay_hidden", false)
      if (this.overlay_hide) clearTimeout(this.overlay_hide)
      this.overlay_hide = setTimeout(() => {
        if (!this.seeking)
        this.overlay.classList.toggle("player_overlay_hidden", true)
      }, 2000)
    })
    
    this.overlay.addEventListener("mouseleave", () => {
      if (this.overlay_hide) clearTimeout(this.overlay_hide)
      if (!this.seeking)
        this.overlay.classList.toggle("player_overlay_hidden", true)
    })

    this.allow_controls(controls)
  }

  set_fonts(fonts) {
    this.octopusInstance.dispose()
    this.octopusInstance = new SubtitlesOctopus({
      video: this.video,
      subUrl: this.current_video.subs.length > 0 ? this.current_video.subs : "/empty.ass",
      fonts: fonts,
      workerUrl: "/includes/subtitles-octopus-worker.js"
    })
  }

  set_video(type, videos, subs = "") {
    this.current_video.videos = videos
    this.current_video.subs = subs
    
    this.btn_cc.classList.toggle("hidden", subs.length == 0)

    if (this.current_video.yt) {
      this.current_video.yt.destroy()
    }
    this.current_video.yt = null
    this.video.src = ""

    while (this.seekbar.buffers.length > 0) {
      const buffer = this.seekbar.buffers.pop()
      this.seekbar.graphic.removeChild(buffer)
    }
    this.seekbar.dial.style.left = "0%"
    this.seekbar.current.style.width = "0%"
    this.lbl_time.textContent = "00:00 / 00:00"

    this.octopusInstance.freeTrack()

    while (this.select_quality.firstChild)
      this.select_quality.removeChild(this.select_quality.firstChild)
    
    this.select_quality.style.display = "none"

    if (Object.keys(videos).length == 0) {
      this.btn_play.disabled = true
      return
    }

    this.btn_play.disabled = false

    switch (type) {
      case "yt":
        this.set_youtube(videos)
        break
      case "gdrive":
        this.set_gdrive(videos, subs)
        break
      default:
        if (this.settings.default_quality in videos) {
          this.video.src = videos[this.settings.default_quality]
        } else {
          for (const video in videos) {
            this.video.src = videos[video]
            break
          }
        }
        if (Object.keys(videos).length > 1) {
          this.select_quality.style.display = ""
          for (const video in videos) {
            const opt = create_element(this.select_quality, "option")
            opt.textContent = video
            if (video == this.settings.default_quality) {
              this.select_quality.value = video
            }
          }
        }
        if (this.btn_cc.checked && subs.length > 0)
          this.octopusInstance.setTrackByUrl(subs)
        break
    }
  }

  set_subtitles(subs) {
    this.current_video.subs = subs
    this.octopusInstance.setTrackByUrl(subs)
  }

  set_playing(playing) {
    this.playing = playing
    if (this.seeking) return
    if (this.current_video.yt) {
      if (!this.current_video.yt.playVideo) return
      if (this.current_video.yt.getCurrentTime() >= this.current_video.yt.getDuration()) {
        this.current_video.yt.pauseVideo()
        return
      }
      if (playing) this.current_video.yt.playVideo()
      else this.current_video.yt.pauseVideo()
    } else {
      if (this.video.currentTime >= this.video.duration) {
        this.video.pause()
        return
      }
      if (playing && this.video.paused) this.video.play()
      else if (!playing && !this.video.paused) this.video.pause()
    }

    if (playing)
      this.btn_play.textContent = "❚❚"
    else
      this.btn_play.textContent = "▶"
  }

  seek(t) {
    if (this.seeking) return
    
    if (this.current_video.yt) {
      if (!this.current_video.yt.playVideo) return
      this.current_video.yt.seekTo(t)
      this.seekbar.set_time(t / this.current_video.yt.getDuration())
      if (this.current_video.yt.getCurrentTime() >= this.current_video.yt.getDuration()) {
        this.current_video.yt.pauseVideo()
      }
    } else {
      this.video.currentTime = t
      if (this.video.currentTime >= this.video.duration) this.video.pause()
    }
  }

  allow_controls(controls) {
    this.btn_play.style.display = controls ? "" : "none"
    this.btn_next.style.display = controls ? "" : "none"
    this.seekbar.classList.toggle("seekbar_controls", controls)
  }

  set_youtube(video_id) {
    this.current_video.yt = video_id
    if (!this.yt_loaded) return
    this.current_video.yt = new YT.Player(this.video2, {
      height: "100%",
      width: "100%",
      playerVars: {"controls": 0},
      videoId: video_id,
      events: {
        "onStateChange": e => {
          e.target.setVolume(this.settings.volume * 100)
          const options = e.target.getOptions()

          options.forEach(option => {
            if (option == "captions" || option == "cc")
              if (this.btn_cc.checked)
                e.target.loadModule(option)
              else
                e.target.unloadModule(option)
          })
          
          this.btn_cc.classList.toggle("hidden", !(options.includes("captions") || options.includes("cc")))

          this.update_youtube_time()
        }
      }
    })
  }
  
  set_gdrive(video_id, subs) {
    const url = `https://docs.google.com/get_video_info?docid=${video_id}&sle=true&hl=en`
    
    httpRequest({
      method: "GET",
      url: url,
      onload: resp => {
        resp = resp.responseText
        const data = {}
        resp.split("&").forEach(kv => {
          const pair = kv.split("=")
          data[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1])
        })

        if (data.status === "fail") {
          console.log("Google Drive request failed: " +
            unescape(data.reason).replace(/\+/g, ""))
        }

        if (!data.fmt_stream_map) {
          alert(
            "Google has removed the video streams associated" +
            " with this item.  It can no longer be played."
          )
        }

        data.links = {}
        data.fmt_stream_map.split(",").forEach(function (item) {
          const pair = item.split("|")
          data.links[pair[0]] = pair[1]
        })

        const videos = {}
        for (const q in data.links) {
          if (q in ITAG_QMAP) 
            videos[ITAG_QMAP[q]] = data.links[q]
        }
        this.set_video("default", videos, subs)
      }
    })
  }

  update_youtube_time() {
    if (this.current_video.yt) {
      const current = this.current_video.yt.getCurrentTime()
      const duration = this.current_video.yt.getDuration()
      this.seekbar.set_time((current || 0) / duration)
      //this.seekbar.set_buffers((this.video.buffered), this.video.duration)
      if (this.current_video.yt.getPlayerState() == 1)
        setTimeout(() => { this.update_youtube_time() }, 200)
      this.lbl_time.textContent = `${seconds_to_hms(current, true)} / ${seconds_to_hms(duration, true)}`
    }
  }

  current_time() {
    return (this.current_video.yt && this.current_video.yt.getCurrentTime) ? this.current_video.yt.getCurrentTime() : this.video.currentTime
  }

  duration() {
    return (this.current_video.yt && this.current_video.yt.getDuration) ? this.current_video.yt.getDuration() : this.video.duration
  }
}

function create_seekbar(player, controls) {
  player.seekbar = create_element(player.overlay, "div", "player_seekbar")
  player.seekbar.classList.toggle("seekbar_controls", controls)

  player.seekbar.graphic = create_element(player.seekbar, "div", "player_seekbar_bar")

  player.seekbar.buffers = []

  player.seekbar.current = create_element(player.seekbar.graphic, "div")
  player.seekbar.current.style.position = "absolute"
  player.seekbar.current.style.width = "0%"
  player.seekbar.current.style.height = "100%"
  player.seekbar.current.style.background = "rgba(0, 70, 255, 0.6)"
  player.seekbar.current.style.pointerEvents = "none"
  player.seekbar.current.style.zIndex = "1"

  player.seekbar.dial = create_element(player.seekbar, "div", "player_seekbar_dial")

  player.seekbar._seek = e => { return seekbar_mouse_move(e, player) }
  player.seekbar._mouseup = e => {
    e.preventDefault()
    player.seeking = false
    if (Object.keys(player.current_video.videos).length == 0) return
    body.removeEventListener("mousemove", player.seekbar._seek)
    body.removeEventListener("mouseup", player.seekbar._mouseup)

    if (player.playing) 
      if (player.current_video.yt) player.current_video.yt.playVideo()
      else player.video.play()

    const t = player.seekbar._seek(e)

    player.on_seek(t)

    player.seekbar.graphic.classList.toggle("seeking", false)
    player.seekbar.dial.classList.toggle("seeking", false)
    if (player.overlay_hide) clearTimeout(player.overlay_hide)
    player.overlay.classList.toggle("player_overlay_hidden", false)
    player.overlay_hide = setTimeout(() => {
      player.overlay.classList.toggle("player_overlay_hidden", true)
    }, 2000)
  }

  player.seekbar.addEventListener("mousedown", e => {
    e.preventDefault()
    if (Object.keys(player.current_video.videos).length == 0) return
    body.addEventListener("mousemove", player.seekbar._seek)
    body.addEventListener("mouseup", player.seekbar._mouseup)

    if (player.current_video.yt)
      player.playing = player.current_video.yt.getPlayerState() != 1
    else
      player.playing = player.video.paused

    player.seeking = true
    
    if (player.current_video.yt)
      player.current_video.yt.pauseVideo()
    else
      player.video.pause()

    player.seekbar._seek(e)
    player.seekbar.graphic.classList.toggle("seeking", true)
    player.seekbar.dial.classList.toggle("seeking", true)
  })

  player.seekbar.set_buffers = (buffers, duration) => {
    while (player.seekbar.buffers.length < buffers.length) {
      const buffer = create_element(player.seekbar.graphic, "div")
      buffer.style.position = "absolute"
      buffer.style.width = "0%"
      buffer.style.height = "100%"
      buffer.style.background = "rgba(255, 255, 255, 0.3)"
      buffer.style.pointerEvents = "none"
      buffer.style.zIndex = "0"
      player.seekbar.buffers.push(buffer)
    }
    while (player.seekbar.buffers.length > buffers.length) {
      const buffer = player.seekbar.buffers.pop()
      player.seekbar.graphic.removeChild(buffer)
    }
    for (let i = 0; i < buffers.length; i++) {
      const start = buffers.start(i) / duration
      let end = buffers.end(i) / duration
      if (end > 0.999) end = 1
      player.seekbar.buffers[i].style.left = start * 100 + "%"
      player.seekbar.buffers[i].style.width = (end - start) * 100 + "%"
    }
  }

  player.seekbar.set_time = t => {
    player.seekbar.current.style.width = t * 100 + "%"
    player.seekbar.dial.style.left = t * 100 + "%"
  }
}

function seek_local(player, t) {
  if (player.current_video.yt)
    player.current_video.yt.seekTo(t * player.current_video.yt.getDuration())
  else
    player.video.currentTime = t * player.video.duration

  player.seekbar.dial.style.left = t * 100 + "%"
  player.seekbar.current.style.width = t * 100 + "%"
}

function seekbar_mouse_move(e, player) {
  e.preventDefault()
  const t = Math.min(Math.max(((e.clientX - player.seekbar.getBoundingClientRect().left) / (player.seekbar.getBoundingClientRect().width)), 0), 1)
  seek_local(player, t)
  return t * player.duration()
}

function httpRequest(opts) {
  document.xmlHttpRequest(opts)
}

const ITAG_QMAP = {
  37: "1080",
  22: "720",
  59: "480",
  18: "360"
}

export default GrassPlayer
