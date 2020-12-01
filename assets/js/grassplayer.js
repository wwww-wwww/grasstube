import css from "../css/player.css"
import { get_cookie, set_cookie } from "./cookies"
import { create_element, seconds_to_hms } from "./util"

class GrassPlayer {
  constructor(root, fonts, controls = true) {
    this.root = root
    this.availableFonts = fonts

    const test_autoplay = document.createElement("video").play()
    if (test_autoplay != undefined) {
      test_autoplay.catch(_ => {
        this.video.muted = true
        this.create_mute_overlay()
      })
    } else {
      this.video.muted = true
      this.create_mute_overlay()
    }

    const yt = create_element(document.head, "script")
    yt.src = "https://www.youtube.com/iframe_api"
    window.onYouTubeIframeAPIReady = () => {
      this.yt_loaded = YT.loaded
      if (YT.loaded == 1) {
        if (typeof (this.current_video.yt) == "string") {
          this.set_youtube(this.current_video.yt)
        }
      }
    }

    this.current_video = {}
    this.current_video.videos = {}
    this.current_video.subs = ""
    this.current_video.yt = null

    this.playing = false

    this.on_toggle_playing = null
    this.on_seek = () => void 0

    this.octopusInstance = null

    this.settings = {}
    this.settings.default_quality = get_cookie("video_quality") || "big"
    this.settings.volume = (Math.pow(10, (get_cookie("video_volume") || 20) / 100) - 1) / 9

    this.video = create_element(root, "video", "player_video")
    this.video.id = "video"
    this.video.volume = this.settings.volume

    this.video.addEventListener("loadedmetadata", () => {
      this.stats.video.textContent = this.video.src
    })

    this.video.addEventListener("abort", () => {
      this.stats.video.textContent = "not loaded"
    })

    this.video2 = create_element(root, "div", "player_video")
    this.video2.id = "video2"

    this.overlay = create_element(root, "div", "player_overlay")
    this.overlay.tmp = create_element(this.overlay, "div", "player_overlay_tmp player_overlay_hidden")
    this.overlay.addEventListener("dblclick", e => {
      if (e.target != this.overlay) return
      this.toggle_fullscreen()
    })

    this.create_ctxmenu()
    this.create_info_panel()
    this.create_controls()
    this.create_seekbar(controls)

    const non_norm = Math.round(100 * Math.log10(this.video.volume * 9 + 1))
    this.stats.volume.textContent = `${Math.round((this.video.volume * 100))}% / ${non_norm}%`

    this.video.addEventListener("progress", () => {
      this.seekbar.set_buffers((this.video.buffered), this.video.duration)
    })

    this.video.addEventListener("timeupdate", () => {
      this.seekbar.set_time((this.video.currentTime || 0) / this.video.duration)
      this.seekbar.set_buffers((this.video.buffered), this.video.duration)
      if (this.video.duration > 0) {
        this.lbl_time.textContent = `${seconds_to_hms(this.video.currentTime, true)} / ${seconds_to_hms(this.video.duration, true)}`
      } else {
        this.lbl_time.textContent = "00:00 / 00:00"
      }
    })

    this.video.addEventListener("play", () => {
      this.btn_play.textContent = "❚❚"
    })

    this.video.addEventListener("pause", () => {
      this.btn_play.textContent = "▶"
    })

    this.overlay_hide = null

    this.overlay.addEventListener("mousemove", () => {
      this.overlay.tmp.classList.toggle("player_overlay_hidden", false)
      if (this.overlay_hide) { clearTimeout(this.overlay_hide) }
      this.overlay_hide = setTimeout(() => {
        if (!this.seeking) {
          this.overlay.tmp.classList.toggle("player_overlay_hidden", true)
        }
      }, 2000)
    })

    this.overlay.addEventListener("mouseleave", () => {
      if (this.overlay_hide) { clearTimeout(this.overlay_hide) }
      if (!this.seeking) {
        this.overlay.tmp.classList.toggle("player_overlay_hidden", true)
      }
    })

    this.allow_controls(controls)
  }

  on_toggle_cc() {
    this.btn_cc.checked = !this.btn_cc.checked
    this.btn_cc.classList.toggle("player_btn_toggle_on", this.btn_cc.checked)

    set_cookie("video_cc", this.btn_cc.checked)

    if (this.current_video.yt) {
      const options = this.current_video.yt.getOptions()

      options.forEach(option => {
        if (option == "captions" || option == "cc") {
          if (this.btn_cc.checked) {
            this.current_video.yt.loadModule(option)
          } else {
            this.current_video.yt.unloadModule(option)
          }
        }
      })
      if (this.octopusInstance) this.octopusInstance.freeTrack()
    } else {
      if (this.btn_cc.checked) {
        if (this.current_video.subs.length > 0) {
          this.set_subtitles(this.current_video.subs)
        }
      } else {
        if (this.octopusInstance) this.octopusInstance.freeTrack()
      }
    }
  }

  set_video(type, videos, subs = "") {
    this.current_video.videos = videos
    this.current_video.subs = subs

    this.btn_cc.classList.toggle("hidden", subs.length == 0)

    if (this.current_video.yt) { this.current_video.yt.destroy() }

    this.current_video.yt = null
    this.video.src = ""

    while (this.seekbar.buffers.length > 0) {
      const buffer = this.seekbar.buffers.pop()
      this.seekbar.graphic.removeChild(buffer)
    }

    this.seekbar.dial.style.left = "0%"
    this.seekbar.current.style.width = "0%"
    this.lbl_time.textContent = "00:00 / 00:00"

    if (this.octopusInstance) {
      this.octopusInstance.freeTrack()
      this.octopusInstance.dispose()
      this.octopusInstance = null
      this.stats.subs.textContent = "not loaded"

      while (this.stats.styles.firstChild) this.stats.styles.removeChild(this.stats.styles.firstChild)
    }

    while (this.select_quality.firstChild) {
      this.select_quality.removeChild(this.select_quality.firstChild)
    }

    this.select_quality.style.display = "none"

    if (Object.keys(videos).length == 0) {
      this.btn_play.disabled = true
      this.stats.videos.textContent = "not loaded"
      return
    }

    this.btn_play.disabled = false

    switch (type) {
      case "yt":
        this.stats.videos.textContent = "youtube"
        this.stats.video.textContent = videos
        this.set_youtube(videos)
        break
      case "gdrive":
        this.set_gdrive(videos, subs)
        break
      default:
        this.stats.videos.textContent = Object.values(videos).join(" ")
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
        if (this.btn_cc.checked && subs.length > 0) {
          this.set_subtitles(subs)
        }
        break
    }
  }

  set_fonts(fonts) {
    this.availableFonts = fonts
    this.set_subtitles(this.current_video.subs)
  }

  set_subtitles(subs) {
    this.current_video.subs = subs

    if (this.octopusInstance) {
      this.octopusInstance.freeTrack()
      this.octopusInstance.dispose()
      this.octopusInstance = null
      this.stats.subs.textContent = "not loaded"

      while (this.stats.styles.firstChild) this.stats.styles.removeChild(this.stats.styles.firstChild)
    }

    if (subs == null || subs.length == 0) return

    this.stats.subs.textContent = subs

    this.octopusInstance = new SubtitlesOctopus({
      video: this.video,
      subUrl: subs,
      availableFonts: this.availableFonts,
      workerUrl: "/includes/subtitles-octopus-worker.js",
      lossyRender: true
    })

    this.octopusInstance.worker.addEventListener("message", e => {
      if (e.data.target == "get-styles") {
        while (this.stats.styles.firstChild) this.stats.styles.removeChild(this.stats.styles.firstChild)
        for (const style of e.data.styles) {
          const e = create_element(this.stats.styles, "div")
          e.textContent = `${style.Name}: ${style.FontName}`
        }
      }
    })

    this.octopusInstance.getStyles()
  }

  play() {
    this.btn_play.textContent = "❚❚"
    if (this.current_video.yt) {
      this.current_video.yt.playVideo()
    } else if (this.video.paused) {
      this.video.play()
    }
  }

  pause() {
    this.btn_play.textContent = "▶"
    if (this.current_video.yt) {
      this.current_video.yt.pauseVideo()
    } else if (!this.video.paused) {
      this.video.pause()
    }
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
    } else {
      if (this.video.currentTime >= this.video.duration) {
        this.video.pause()
        return
      }
    }

    if (playing) {
      this.play()
    } else {
      this.pause()
    }
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
      if (this.video.currentTime >= this.video.duration) { this.video.pause() }
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
      playerVars: { "controls": 0 },
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

  toggle_fullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      this.root.requestFullscreen()
    }
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
    if (this.current_video.yt && this.current_video.yt.getCurrentTime) {
      return this.current_video.yt.getCurrentTime()
    } else {
      return this.video.currentTime
    }
  }

  duration() {
    if (this.current_video.yt && this.current_video.yt.getDuration) {
      return this.current_video.yt.getDuration()
    } else {
      return this.video.duration
    }
  }

  create_mute_overlay() {
    const e = create_element(this.root, "div")
    e.style.position = "absolute"
    e.style.width = "100%"
    e.style.height = "100%"
    e.style.display = "flex"
    e.style.alignItems = "center"
    e.style.backgroundColor = "rgba(0, 0, 0, 0.2)"
    e.style.cursor = "pointer"
    e.addEventListener("click", () => {
      this.video.muted = false
      this.root.removeChild(e)
    })

    let text = create_element(e, "span")
    text.style.textAlign = "center"
    text.style.flex = "1"
    text.style.color = "white"
    text.style.textShadow = "0.1em 0.1em 0.2em black"
    text.style.pointerEvents = "none"
    text.textContent = "Click to unmute"
  }

  create_info_panel() {
    const info_panel = create_element(null, "div", "player_info")
    const btn_info = create_element(this.ctxmenu, "button")
    btn_info.textContent = "stats"
    btn_info.addEventListener("click", () => {
      this.overlay.appendChild(info_panel)
    })

    this.stats = {}

    let row = create_element(info_panel, "div")
    const lbl_videos = create_element(row, "span")
    lbl_videos.textContent = "videos:"
    this.stats.videos = create_element(row, "span")
    this.stats.videos.textContent = "not loaded"

    row = create_element(info_panel, "div")
    const lbl_video = create_element(row, "span")
    lbl_video.textContent = "video:"
    this.stats.video = create_element(row, "span")
    this.stats.video.textContent = "not loaded"

    row = create_element(info_panel, "div")
    const lbl_subs = create_element(row, "span")
    lbl_subs.textContent = "subtitles:"
    this.stats.subs = create_element(row, "span")
    this.stats.subs.textContent = "not loaded"

    row = create_element(info_panel, "div")
    const lbl_volume = create_element(row, "span")
    lbl_volume.textContent = "volume:"
    this.stats.volume = create_element(row, "span")

    row = create_element(info_panel, "div")
    const lbl_styles = create_element(row, "span")
    lbl_styles.textContent = "loaded styles:"
    this.stats.styles = create_element(row, "span")

    const btn_close = create_element(info_panel, "button")
    btn_close.textContent = "close"
    btn_close.addEventListener("click", () => {
      if (info_panel.parentElement) (info_panel.parentElement.removeChild(info_panel))
    })
  }

  create_ctxmenu() {
    this.ctxmenu = create_element(null, "div", "player_ctxmenu")
    document.addEventListener("click", e => {
      if (e.target == this.ctxmenu) return
      if (this.ctxmenu.parentElement) {
        this.ctxmenu.parentElement.removeChild(this.ctxmenu)
      }
    })
  }

  create_controls() {
    const bottom_shade = create_element(this.overlay.tmp, "div", "player_shade")
    bottom_shade.addEventListener("contextmenu", e => {
      e.preventDefault()
      this.overlay.appendChild(this.ctxmenu)
      const overlay_bbox = this.overlay.getBoundingClientRect()
      const bbox = this.ctxmenu.getBoundingClientRect()
      this.ctxmenu.style.left = `${e.clientX - overlay_bbox.x}px`
      this.ctxmenu.style.top = `${e.clientY - overlay_bbox.y - bbox.height}px`
    })

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
    this.btn_next.addEventListener("click", () => { this.on_next() })

    const slider_volume = create_element(bottom_shade, "input", "player_volume")
    slider_volume.type = "range"
    slider_volume.min = 0
    slider_volume.max = 100
    slider_volume.step = 1
    slider_volume.value = (get_cookie("video_volume") || 20)

    slider_volume.addEventListener("input", () => {
      set_cookie("video_volume", slider_volume.value)
      this.settings.volume = (Math.pow(10, slider_volume.value / 100) - 1) / 9
      if (this.current_video.yt) {
        this.current_video.yt.setVolume(this.settings.volume * 100)
      }
      this.video.volume = this.settings.volume

      this.stats.volume.textContent = `${Math.round((this.video.volume * 100))}% / ${Math.round(slider_volume.value)}%`
    })

    this.lbl_time = create_element(bottom_shade, "span", "player_time")
    this.lbl_time.textContent = "00:00 / 00:00"

    const right_side = create_element(bottom_shade, "div")
    right_side.style.float = "right"

    this.btn_cc = create_element(right_side, "button", "player_btn player_btn_cc")

    const _cc = get_cookie("video_cc")
    if (_cc == null) {
      this.btn_cc.checked = true
    } else {
      this.btn_cc.checked = _cc
    }

    this.btn_cc.classList.toggle("player_btn_toggle_on", this.btn_cc.checked)
    this.btn_cc.textContent = "CC"

    this.btn_cc.addEventListener("click", this.on_toggle_cc)

    this.select_quality = create_element(right_side, "select", "player_select_quality")
    this.select_quality.style.display = "none"

    this.select_quality.addEventListener("change", () => {
      this.video.src = this.current_video.videos[this.select_quality.value]
      set_cookie("video_quality", this.select_quality.value)
    })

    const btn_fullscreen = create_element(right_side, "button", "player_btn")
    btn_fullscreen.textContent = "⛶"
    btn_fullscreen.addEventListener("click", () => { this.toggle_fullscreen() })
  }

  create_seekbar() {
    const seekbar = create_element(this.overlay.tmp, "div", "player_seekbar")
    this.seekbar = seekbar

    const mtime = create_element(seekbar, "div", "player_seekbar_time")

    seekbar.graphic = create_element(seekbar, "div", "player_seekbar_bar")

    seekbar.buffers = []

    seekbar.current = create_element(seekbar.graphic, "div")
    seekbar.current.style.position = "absolute"
    seekbar.current.style.width = "0%"
    seekbar.current.style.height = "100%"
    seekbar.current.style.background = "rgba(0, 70, 255, 0.6)"
    seekbar.current.style.pointerEvents = "none"
    seekbar.current.style.zIndex = "1"

    seekbar.dial = create_element(seekbar, "div", "player_seekbar_dial")

    seekbar._seek = e => { return this.seekbar_on_mouse_move(e) }
    seekbar._mouseup = e => { this.seekbar_on_mouse_up(e) }
    seekbar.addEventListener("mousedown", e => { this.seekbar_on_mouse_down(e) })
    seekbar.addEventListener("mousemove", e => {
      if (!this.current_video.yt && Object.keys(this.current_video.videos).length == 0) {
        mtime.textContent = ""
        return
      }
      const rect = this.seekbar.getBoundingClientRect()
      const pct = Math.min(Math.max(((e.clientX - rect.left) / (rect.width)), 0), 1)
      let t = pct
      if (this.current_video.yt) {
        t = t * this.current_video.yt.getDuration()
      } else {
        t = t * this.video.duration
      }
      mtime.textContent = seconds_to_hms(t, true)
      mtime.style.left = `${pct * 100}%`
    })

    seekbar.set_buffers = (buffers, duration) => {
      while (seekbar.buffers.length < buffers.length) {
        const buffer = create_element(seekbar.graphic, "div")
        buffer.style.position = "absolute"
        buffer.style.width = "0%"
        buffer.style.height = "100%"
        buffer.style.background = "rgba(255, 255, 255, 0.3)"
        buffer.style.pointerEvents = "none"
        buffer.style.zIndex = "0"
        seekbar.buffers.push(buffer)
      }
      while (seekbar.buffers.length > buffers.length) {
        const buffer = seekbar.buffers.pop()
        seekbar.graphic.removeChild(buffer)
      }
      for (let i = 0; i < buffers.length; i++) {
        const start = buffers.start(i) / duration
        let end = buffers.end(i) / duration
        if (end > 0.999) end = 1
        seekbar.buffers[i].style.left = start * 100 + "%"
        seekbar.buffers[i].style.width = (end - start) * 100 + "%"
      }
    }

    seekbar.set_time = t => {
      seekbar.current.style.width = t * 100 + "%"
      seekbar.dial.style.left = t * 100 + "%"
    }
  }

  seekbar_on_mouse_move(e) {
    e.preventDefault()
    const rect = this.seekbar.getBoundingClientRect()
    const t = Math.min(Math.max(((e.clientX - rect.left) / (rect.width)), 0), 1)

    if (this.current_video.yt) {
      if (this.current_video.getDuration) {
        this.current_video.yt.seekTo(t * this.current_video.yt.getDuration())
      }
    } else {
      this.video.currentTime = t * this.video.duration
    }

    this.seekbar.dial.style.left = t * 100 + "%"
    this.seekbar.current.style.width = t * 100 + "%"
    return t * this.duration()
  }

  seekbar_on_mouse_down(e) {
    if (e.buttons != 1) return
    e.preventDefault()

    if (Object.keys(this.current_video.videos).length == 0) return
    body.addEventListener("mousemove", this.seekbar._seek)
    window.addEventListener("mouseup", this.seekbar._mouseup)

    if (this.current_video.yt) {
      this.playing = this.current_video.yt.getPlayerState() != 1
    } else {
      this.playing = !this.video.paused
    }

    this.seeking = true

    this.pause()

    this.seekbar._seek(e)
    this.seekbar.graphic.classList.toggle("seeking", true)
    this.seekbar.dial.classList.toggle("seeking", true)
  }

  seekbar_on_mouse_up(e) {
    e.preventDefault()
    this.seeking = false

    if (Object.keys(this.current_video.videos).length == 0) return

    body.removeEventListener("mousemove", this.seekbar._seek)
    window.removeEventListener("mouseup", this.seekbar._mouseup)

    if (this.playing) { this.play() }

    this.on_seek(this.seekbar._seek(e))

    this.seekbar.graphic.classList.toggle("seeking", false)
    this.seekbar.dial.classList.toggle("seeking", false)
    if (this.overlay_hide) clearTimeout(this.overlay_hide)
    this.overlay.tmpclassList.toggle("player_overlay_hidden", false)
    this.overlay_hide = setTimeout(() => {
      this.overlay.tmp.classList.toggle("player_overlay_hidden", true)
    }, 2000)
  }
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
