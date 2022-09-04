import { get_cookie, set_cookie } from "./cookies"
import { create_element, seconds_to_hms } from "./util"
import SubtitlesOctopus from "./subtitles-octopus"

class GrassPlayer {
  constructor(root, fonts, controls = true) {
    this.root = root
    this.fullscreen_element = this.root
    this.availableFonts = fonts
    this.root.classList.toggle("grassplayer", true)

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
      document.yt_loaded = YT.loaded
      if (YT.loaded == 1) {
        if (typeof (this.current_video.yt) == "string") {
          this.set_youtube(this.current_video.yt)
        }
      }
    }

    this.root.setAttribute("tabindex", "0")

    this.root.addEventListener("keydown", e => this.on_keydown(e))
    this.root.addEventListener("wheel", e => this.on_wheel(e))

    this.load_settings()

    this.current_video = {}
    this.current_video.type = ""
    this.current_video.videos = {}
    this.current_video.subs = ""
    this.current_video.yt = null

    this.previews = []

    this.playing = false

    this.on_toggle_playing = null
    this.on_seek = t => this.seek(t)

    this.cc = this.settings.cc || true
    this.on_toggle_cc = []

    this.speed = 1

    this.video = create_element(root, "video")
    this.video.crossOrigin = "anonymous"
    this.video.id = "video"
    this.video.volume = this.get_volume()

    this.video.addEventListener("loadedmetadata", () => {
      this.stats.video.textContent = this.video.src
    })

    this.video.addEventListener("abort", () => {
      this.stats.video.textContent = "not loaded"
    })

    this.octopusInstance = null

    this.video2 = create_element(root, "div", "video")
    this.video2.id = "video2"

    this.overlay = create_element(root, "div", "overlay overlay_hidden")
    this.overlay.addEventListener("contextmenu", e => {
      if (this.ctxmenu.parentElement) return
      if (e.target != this.overlay && e.target != this.bottom_shade) return
      e.preventDefault()
      this.overlay.appendChild(this.ctxmenu)
      const overlay_bbox = this.overlay.getBoundingClientRect()
      const bbox = this.ctxmenu.getBoundingClientRect()
      this.ctxmenu.style.left = `${e.clientX - overlay_bbox.x}px`
      if (e.clientY + bbox.height > overlay_bbox.height + overlay_bbox.y) {
        this.ctxmenu.style.top = `${e.clientY - overlay_bbox.y - bbox.height}px`
      } else {
        this.ctxmenu.style.top = `${e.clientY - overlay_bbox.y}px`
      }
    })
    this.overlay.addEventListener("dblclick", e => {
      if (e.target != this.overlay) return
      this.toggle_fullscreen()
    })

    this.overlay.osd = create_element(this.overlay, "div", "overlay_osd hidden")
    this.overlay.osd.hide = null
    this.show_osd = message => {
      this.overlay.osd.textContent = message
      this.overlay.osd.classList.toggle("hidden", false)
      if (this.overlay.osd.hide) { clearTimeout(this.overlay.osd.hide) }
      this.overlay.osd.hide = setTimeout(() => {
        this.overlay.osd.classList.toggle("hidden", true)
      }, 1000)
    }

    this.overlay.tmp = create_element(this.overlay, "div", "overlay_tmp")

    this.create_ctxmenu()
    this.create_settings()
    this.stats_panel = this.create_stats_panel()
    this.create_capture()
    this.create_controls()
    this.create_seekbar(controls)

    this.stats.volume.textContent = `${Math.round(this.get_volume() * 100)}% / ${this.settings.video_volume}%`

    this.on_playable = null

    this.video.addEventListener("progress", () => {
      this.seekbar.set_buffers(this.video.buffered, this.video.duration)
      this.update_playable()
    })

    const update_time = () => {
      if (this.video.duration > 0) {
        this.lbl_time.textContent = `${seconds_to_hms(this.video.currentTime, true)} / ${seconds_to_hms(this.video.duration, true)}`
      } else {
        this.lbl_time.textContent = "00:00 / 00:00"
      }
    }

    this.video.addEventListener("loadedmetadata", update_time)

    this.video.addEventListener("timeupdate", () => {
      this.seekbar.set_time((this.video.currentTime || 0) / this.video.duration)
      update_time()
      this.update_playable()
    })

    this.video.addEventListener("play", () => {
      this.btn_play.textContent = "pause"
    })

    this.video.addEventListener("pause", () => {
      this.btn_play.textContent = "play_arrow"
    })

    this.overlay_hide = null

    this.overlay.addEventListener("mousemove", () => {
      this.overlay.classList.toggle("overlay_hidden", false)
      if (this.overlay_hide) { clearTimeout(this.overlay_hide) }
      this.overlay_hide = setTimeout(() => {
        if (!this.seeking) {
          this.overlay.classList.toggle("overlay_hidden", true)
        }
      }, 2000)
    })
    this.overlay.addEventListener("mouseleave", () => {
      if (this.overlay_hide) { clearTimeout(this.overlay_hide) }
      if (!this.seeking) {
        this.overlay.classList.toggle("overlay_hidden", true)
      }
    })

    this.set_controls(controls)
  }

  load_settings() {
    this.settings = {}
    this.settings.set = (setting, value) => {
      this.settings[setting] = value
      set_cookie(setting, value);
    }
    this.settings.video_quality = get_cookie("video_quality", "big")
    this.settings.video_volume = get_cookie("video_volume", 20)
    this.settings.cc = get_cookie("video_cc", true)
    this.settings.video_volume_scroll = get_cookie("video_volume_scroll", false)
    this.settings.video_volume_arrow = get_cookie("video_volume_arrow", true)
    this.settings.video_play_space = get_cookie("video_play_space", true)
    this.settings.video_seek_arrow = get_cookie("video_seek_arrow", true)
    this.settings.video_fullscreen_f = get_cookie("video_fullscreen_f", true)
  }

  get_volume() {
    return (Math.pow(10, (this.settings.video_volume) / 100) - 1) / 9
  }

  get_time() {
    if (this.current_video.yt) {
      if (this.current_video.yt.getDuration) {
        return this.current_video.yt.getCurrentTime()
      } else {
        return 0
      }
    } else {
      return this.video.currentTime
    }
  }

  toggle_cc() {
    this.cc = !this.cc
    this.settings.set("video_cc", this.cc)
    this.on_toggle_cc.forEach(e => e(this.cc))

    if (this.current_video.yt) {
      const options = this.current_video.yt.getOptions()

      options.forEach(option => {
        if (option == "captions" || option == "cc") {
          if (this.cc) {
            this.current_video.yt.loadModule(option)
          } else {
            this.current_video.yt.unloadModule(option)
          }
        }
      })
      if (this.octopusInstance) this.octopusInstance.freeTrack()
    } else {
      if (this.cc) {
        if (this.current_video.subs.length > 0) {
          this.set_subtitles(this.current_video.subs)
        }
      } else {
        if (this.octopusInstance) this.octopusInstance.freeTrack()
      }
    }
  }

  on_keydown(e) {
    if (e.target.tagName == "INPUT" && !(e in this)) return
    switch (e.key) {
      case "Enter":
        break
      case "ArrowLeft":
        if (!this.settings.video_seek_arrow) return
        if (!this.has_controls) return
        this.on_seek(Math.max(this.get_time() - 5, 0))
        break
      case "ArrowRight":
        if (!this.settings.video_seek_arrow) return
        if (!this.has_controls) return
        this.on_seek(Math.min(this.get_time() + 5, this.duration()))
        break
      case "ArrowUp":
        if (!this.settings.video_volume_arrow) return
        this.add_volume(5)
        break
      case "ArrowDown":
        if (!this.settings.video_volume_arrow) return
        this.add_volume(-5)
        break
      case " ":
        if (!this.settings.video_play_space) return
        if (!this.btn_play.disabled) this.btn_play.click()
        break
      case "f":
        if (!this.settings.video_fullscreen_f) return
        this.toggle_fullscreen()
        break
      default:
        return
    }
    e.preventDefault()
  }

  on_wheel(e) {
    if (!this.settings.video_volume_scroll) return
    if (e.target != this.overlay && e.target != this.volume_slider) return
    e.preventDefault()
    this.add_volume(e.deltaY > 0 ? -5 : 5)
  }

  set_video(type, videos, subs = "") {
    this.current_video.type = type
    this.current_video.videos = videos
    this.current_video.subs = subs

    this.load_previews()

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
      this.octopusInstance.destroy()
      this.octopusInstance = null
      this.stats.subs.textContent = "not loaded"

      while (this.stats.styles.firstChild) {
        this.stats.styles.removeChild(this.stats.styles.firstChild)
      }
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
        if (this.settings.video_quality in videos) {
          this.video.src = videos[this.settings.video_quality]
        } else {
          for (const video in videos) {
            this.video.src = videos[video]
            break
          }
        }

        this.video.currentTime = 0.01

        if (Object.keys(videos).length > 1) {
          this.select_quality.style.display = ""
          for (const video in videos) {
            const opt = create_element(this.select_quality, "option")
            opt.textContent = video
            if (video == this.settings.video_quality) {
              this.select_quality.value = video
            }
          }
        }

        if (this.cc && subs.length > 0) {
          this.set_subtitles(subs)
        }

        this.video.playbackRate = this.speed

        break
    }
  }

  set_fonts(fonts) {
    this.availableFonts = fonts
    this.set_subtitles(this.current_video.subs)
  }

  set_subtitles(subs) {
    const playing = this.playing
    if (playing) this.pause()
    this.btn_cc.classList.toggle("hidden", subs.length == 0)
    this.current_video.subs = subs

    if (this.octopusInstance) {
      this.octopusInstance.destroy()
      this.octopusInstance = null
      this.stats.subs.textContent = "not loaded"

      while (this.stats.styles.firstChild) {
        this.stats.styles.removeChild(this.stats.styles.firstChild)
      }
    }

    if (subs == null || subs.length == 0) return

    this.stats.subs.textContent = subs

    this.octopusInstance = new SubtitlesOctopus({
      video: this.video,
      subUrl: subs,
      fallbackFont: "https://res.cloudinary.com/grass/raw/upload/v1612694597/fonts/arialbd.ttf",
      availableFonts: this.availableFonts,
      workerUrl: "/includes/subtitles-octopus-worker.js"
    })

    this.octopusInstance.getStyles((err, styles) => {
      if (!styles) {
        console.log(err)
        return
      }
      for (const style of styles) {
        const e = create_element(this.stats.styles, "div")
        e.textContent = `${style.Name}: ${style.FontName}`
      }
    })

    if (playing) this.play()
  }

  play() {
    this.btn_play.textContent = "pause"
    if (this.current_video.yt) {
      if (!this.current_video.yt.playVideo) return
      this.current_video.yt.playVideo()
    } else if (this.video.paused) {
      this.video.play()
    }
  }

  pause() {
    this.btn_play.textContent = "play_arrow"
    if (this.current_video.yt) {
      if (!this.current_video.yt.pauseVideo) return
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

  seek_to(t) {
    if (this.current_video.yt) {
      if (!this.current_video.yt.playVideo) return
      this.current_video.yt.seekTo(t)
      if (this.current_video.yt.getCurrentTime() >= this.current_video.yt.getDuration()) {
        this.current_video.yt.pauseVideo()
      }
    } else {
      this.video.currentTime = t
      if (this.video.currentTime >= this.video.duration) {
        this.video.pause()
      }
    }
    this.seekbar.set_time(t / this.duration())
  }

  seek(t) {
    if (this.seeking) return
    this.seek_to(t)
  }

  load_previews() {
    this.previews = []
    this.seekbar.preview.classList.toggle("hidden", true)
    this.stats.thumbs.textContent = "none"

    if (this.current_video.type == "yt") return

    if (!this.has_controls
      || Object.keys(this.current_video.videos).length == 0) {
      return
    }

    const subs = this.current_video.subs
    const videos = this.current_video.videos
    let _path = ""
    let filename = ""

    if (subs) {
      filename = subs.split("/").pop()
      _path = subs.substr(0, subs.lastIndexOf("/"))
      _path = _path.replace("subs", "thumbs")
    } else {
      const video = videos[Object.keys(videos)[0]]
      filename = video.split("/").pop()
      _path = video.substr(0, video.lastIndexOf("/"))
      _path = `${_path}/thumbs`
    }

    filename = filename.substr(0, filename.lastIndexOf("."))
    _path = `${_path}/${filename}.thumb`

    fetch(_path, { method: "GET", mode: "cors" })
      .then(r => r.arrayBuffer())
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

        this.stats.thumbs.textContent = `${n_frames} images; ${mime_type}`
        this.seekbar.preview.classList.toggle("hidden", false)
      })
  }

  set_controls(controls) {
    this.has_controls = controls
    this.btn_play.style.display = controls ? "" : "none"
    this.btn_next.style.display = controls ? "" : "none"
    this.seekbar.classList.toggle("seekbar_controls", controls)
    this.load_previews()
  }

  set_youtube(video_id) {
    this.current_video.yt = video_id
    if (!document.yt_loaded) return
    this.current_video.yt = new YT.Player(this.video2, {
      height: "100%",
      width: "100%",
      playerVars: { controls: 0 },
      videoId: video_id,
      events: {
        "onStateChange": e => {
          e.target.setVolume(this.get_volume() * 100)
          e.target.setPlaybackRate(this.speed)
          this.update_youtube_time()
        },
        "onApiChange": e => {
          const options = e.target.getOptions()
          options.forEach(option => {
            if (option == "captions" || option == "cc") {
              e.target.setOption(option, "reload", true)

              if (this.cc) {
                this.current_video.yt.loadModule(option)
              } else {
                this.current_video.yt.unloadModule(option)
              }
            }
          })

          this.btn_cc.classList.toggle("hidden", !(options.includes("captions") || options.includes("cc")))
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
      this.fullscreen_element.requestFullscreen()
    }
  }

  update_youtube_time() {
    if (this.current_video.yt) {
      const current = this.current_video.yt.getCurrentTime()
      const duration = this.current_video.yt.getDuration()
      this.seekbar.set_time((current || 0) / duration)
      //this.seekbar.set_buffers((this.video.buffered), this.video.duration)
      if (this.current_video.yt.getPlayerState() == 1) {
        setTimeout(() => { this.update_youtube_time() }, 200)
      }
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
    if (this.current_video.yt) {
      if (this.current_video.yt.getDuration) {
        return this.current_video.yt.getDuration()
      } else {
        return 0
      }
    } else {
      return this.video.duration
    }
  }

  create_mute_overlay() {
    const e = create_element(this.root, "div", "mute_overlay")
    e.addEventListener("click", () => {
      this.video.muted = false
      this.root.removeChild(e)
    })

    let text = create_element(e, "span")
    text.textContent = "Click to unmute"
  }

  create_ctxmenu() {
    this.ctxmenu = create_element(null, "div", "ctxmenu")
    this.ctxmenu_open = false
    document.addEventListener("click", e => {
      if (e.target == this.ctxmenu) return
      if (this.ctxmenu.parentElement) {
        this.ctxmenu.parentElement.removeChild(this.ctxmenu)
      }
    })

    const fullscreen = create_element(this.ctxmenu, "button")
    fullscreen.textContent = "Enter Fullscreen"
    fullscreen.addEventListener("click", () => this.toggle_fullscreen())

    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        fullscreen.textContent = "Exit Fullscreen"
      } else {
        fullscreen.textContent = "Enter Fullscreen"
      }
    })

    const captions = create_element(this.ctxmenu, "button")
    captions.textContent = this.cc ? "Hide Captions" : "Show Captions"
    captions.addEventListener("click", () => this.toggle_cc())
    this.on_toggle_cc.push(cc => {
      captions.textContent = cc ? "Hide Captions" : "Show Captions"
    })
  }

  create_stats_panel() {
    const stats_panel = create_element(null, "div", "stats")
    const btn_stats = create_element(this.ctxmenu, "button")
    btn_stats.textContent = "Stats"
    btn_stats.addEventListener("click", () => {
      this.overlay.appendChild(stats_panel)
    })

    this.stats = {}

    const stats_body = create_element(stats_panel, "div")

    let row = create_element(stats_body, "div")
    const lbl_videos = create_element(row, "span")
    lbl_videos.textContent = "Videos:"
    this.stats.videos = create_element(row, "span")
    this.stats.videos.textContent = "not loaded"

    row = create_element(stats_body, "div")
    const lbl_video = create_element(row, "span")
    lbl_video.textContent = "Video:"
    this.stats.video = create_element(row, "span")
    this.stats.video.textContent = "not loaded"

    row = create_element(stats_body, "div")
    const lbl_subs = create_element(row, "span")
    lbl_subs.textContent = "Subtitles:"
    this.stats.subs = create_element(row, "span")
    this.stats.subs.textContent = "not loaded"

    row = create_element(stats_body, "div")
    const lbl_volume = create_element(row, "span")
    lbl_volume.textContent = "Volume:"
    this.stats.volume = create_element(row, "span")

    row = create_element(stats_body, "div")
    const lbl_playable = create_element(row, "span")
    lbl_playable.textContent = "Playable:"
    this.stats.playable = create_element(row, "span")

    row = create_element(stats_body, "div")
    const lbl_thumbs = create_element(row, "span")
    lbl_thumbs.textContent = "Thumbs:"
    this.stats.thumbs = create_element(row, "span")

    row = create_element(stats_body, "div")
    const lbl_styles = create_element(row, "span")
    lbl_styles.textContent = "Styles:"
    this.stats.styles = create_element(row, "span")

    const btn_close = create_element(stats_panel, "button")
    btn_close.textContent = "Close"
    btn_close.addEventListener("click", () => {
      if (stats_panel.parentElement) {
        stats_panel.parentElement.removeChild(stats_panel)
      }
    })

    return stats_body
  }

  stats_add_row(label, value) {
    let row = create_element(this.stats_panel, "div")
    if (label) {
      const lbl = create_element(row, "span")
      lbl.textContent = label
    }
    if (value != null && value != undefined) {
      const val = create_element(row, "span")
      return val
    }
    return row
  }

  create_settings() {
    const settings = create_element(null, "div", "settings")
    const btn_settings = create_element(this.ctxmenu, "button")
    btn_settings.textContent = "Settings"
    btn_settings.addEventListener("click", () => {
      this.overlay.appendChild(settings)
    })

    let row = create_element(settings, "div")
    const input_volume_scroll = create_element(row, "input")
    input_volume_scroll.id = "grassplayer_input_volume_scroll"
    input_volume_scroll.type = "checkbox"
    input_volume_scroll.checked = this.settings.video_volume_scroll
    input_volume_scroll.addEventListener("change", () => {
      this.settings.set("video_volume_scroll", input_volume_scroll.checked)
    })
    const lbl_volume_scroll = create_element(row, "label")
    lbl_volume_scroll.textContent = "Change volume with scroll wheel"
    lbl_volume_scroll.htmlFor = "grassplayer_input_volume_scroll"

    row = create_element(settings, "div")
    const input_volume_arrow = create_element(row, "input")
    input_volume_arrow.id = "grassplayer_input_volume_arrow"
    input_volume_arrow.type = "checkbox"
    input_volume_arrow.checked = this.settings.video_volume_arrow
    input_volume_arrow.addEventListener("change", () => {
      this.settings.set("video_volume_arrow", input_volume_arrow.checked)
    })
    const lbl_volume_arrow = create_element(row, "label")
    lbl_volume_arrow.textContent = "Change volume with up and down arrow keys"
    lbl_volume_arrow.htmlFor = "grassplayer_input_volume_arrow"

    row = create_element(settings, "div")
    const input_play_space = create_element(row, "input")
    input_play_space.id = "grassplayer_input_play_space"
    input_play_space.type = "checkbox"
    input_play_space.checked = this.settings.video_play_space
    input_play_space.addEventListener("change", () => {
      this.settings.set("video_play_space", input_play_space.checked)
    })
    const lbl_play_space = create_element(row, "label")
    lbl_play_space.textContent = "Play and pause using the space bar"
    lbl_play_space.htmlFor = "grassplayer_input_play_space"

    row = create_element(settings, "div")
    const input_seek_arrow = create_element(row, "input")
    input_seek_arrow.id = "grassplayer_input_seek_arrow"
    input_seek_arrow.type = "checkbox"
    input_seek_arrow.checked = this.settings.video_seek_arrow
    input_seek_arrow.addEventListener("change", () => {
      this.settings.set("video_seek_arrow", input_seek_arrow.checked)
    })
    const lbl_seek_arrow = create_element(row, "label")
    lbl_seek_arrow.textContent = "Seek using arrow keys"
    lbl_seek_arrow.htmlFor = "grassplayer_input_seek_arrow"

    row = create_element(settings, "div")
    const input_fullscreen_f = create_element(row, "input")
    input_fullscreen_f.id = "grassplayer_input_fullscreen_f"
    input_fullscreen_f.type = "checkbox"
    input_fullscreen_f.checked = this.settings.video_fullscreen_f
    input_fullscreen_f.addEventListener("change", () => {
      this.settings.set("video_fullscreen_f", input_fullscreen_f.checked)
    })
    const lbl_fullscreen_f = create_element(row, "label")
    lbl_fullscreen_f.textContent = "Toggle fullscreen by pressing F"
    lbl_fullscreen_f.htmlFor = "grassplayer_input_fullscreen_f"

    const btn_close = create_element(settings, "button")
    btn_close.textContent = "close"
    btn_close.addEventListener("click", () => {
      if (settings.parentElement) {
        settings.parentElement.removeChild(settings)
      }
    })
  }

  create_controls() {
    this.bottom_shade = create_element(this.overlay.tmp, "div", "shade")

    this.btn_play = create_element(this.bottom_shade, "button")
    disable_space(this.btn_play)
    this.btn_play.textContent = "play_arrow"
    this.btn_play.disabled = true

    this.btn_play.addEventListener("click", () => {
      if (!this.has_controls) return
      const playing = this.btn_play.textContent == "play_arrow"
      if (playing) {
        this.btn_play.textContent = "pause"
      } else {
        this.btn_play.textContent = "play_arrow"
      }
      if (this.on_toggle_playing != null) {
        this.on_toggle_playing(playing)
      } else {
        this.set_playing(playing)
      }
    })

    this.btn_next = create_element(this.bottom_shade, "button")
    disable_space(this.btn_next)
    this.btn_next.textContent = "skip_next"

    this.on_next = void 0
    this.btn_next.addEventListener("click", () => this.on_next())

    this.volume_slider = create_element(this.bottom_shade, "input", "volume_slider")
    this.volume_slider.type = "range"
    this.volume_slider.min = 0
    this.volume_slider.max = 100
    this.volume_slider.step = 1
    this.volume_slider.value = this.settings.video_volume

    this.update_volume = () => {
      this.settings.set("video_volume", this.volume_slider.value)
      if (this.current_video.yt) {
        this.current_video.yt.setVolume(this.get_volume() * 100)
      }
      this.video.volume = this.get_volume()
      this.stats.volume.textContent = `${Math.round(this.video.volume * 100)}% / ${this.settings.video_volume}%`
    }

    this.add_volume = n => {
      this.volume_slider.value = Number(this.volume_slider.value) + n
      this.show_osd(`Volume: ${this.volume_slider.value}%`)
      this.update_volume()
    }

    this.volume_slider.addEventListener("input", () => this.update_volume())

    this.lbl_time = create_element(this.bottom_shade, "span", "player_time")
    this.lbl_time.textContent = "00:00 / 00:00"

    const right_side = create_element(this.bottom_shade, "div", "right-side")

    this.btn_cc = create_element(right_side, "button", "cc")
    disable_space(this.btn_cc)
    this.btn_cc.checked = this.cc
    this.btn_cc.textContent = this.cc ? "subtitles" : "subtitles_off"
    this.btn_cc.addEventListener("click", () => this.toggle_cc())
    this.on_toggle_cc.push(cc => {
      this.btn_cc.checked = cc
      this.btn_cc.textContent = cc ? "subtitles" : "subtitles_off"
    })

    this.select_quality = create_element(right_side, "select", "player_select_quality")
    disable_space(this.select_quality)
    this.select_quality.style.display = "none"

    this.select_quality.addEventListener("change", () => {
      this.video.src = this.current_video.videos[this.select_quality.value]
      this.settings.set("video_quality", this.select_quality.value)
    })

    this.btn_fullscreen = create_element(right_side, "button")
    disable_space(this.btn_fullscreen)
    this.btn_fullscreen.textContent = "fullscreen"
    this.btn_fullscreen.addEventListener("click", () => this.toggle_fullscreen())

    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        this.btn_fullscreen.textContent = "fullscreen_exit"
      } else {
        this.btn_fullscreen.textContent = "fullscreen"
      }
    })
  }

  create_seekbar() {
    const seekbar = create_element(this.overlay.tmp, "div", "seekbar")
    this.seekbar = seekbar

    const mtime = create_element(seekbar, "div", "seekbar_time")

    seekbar.preview = create_element(seekbar, "canvas", "seekbar_preview")
    const preview_ctx = seekbar.preview.getContext("2d")

    seekbar.graphic = create_element(seekbar, "div", "seekbar_bar")

    seekbar.buffers = []

    seekbar.current = create_element(seekbar.graphic, "div", "current")
    seekbar.current.style.width = "0%"

    seekbar.dial = create_element(seekbar, "div", "seekbar_dial")

    seekbar._seek = e => { return this._seek(e) }
    seekbar._mouseup = e => this.seekbar_on_mouse_up(e)

    seekbar.addEventListener("mousedown", e => this.seekbar_on_mouse_down(e))
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
    })

    seekbar.set_buffers = (buffers, duration) => {
      while (seekbar.buffers.length < buffers.length) {
        const buffer = create_element(seekbar.graphic, "div")
        buffer.style.width = "0%"
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

  seek_to(t) {
    t = Math.max(t, 0.01)

    if (this.current_video.yt) {
      if (this.current_video.yt.getDuration) {
        this.current_video.yt.seekTo(t)
      }
    } else {
      this.video.currentTime = t
    }

    const pct = t / this.duration()
    this.seekbar.dial.style.left = pct * 100 + "%"
    this.seekbar.current.style.width = pct * 100 + "%"

    this.update_playable()

    return t
  }

  _seek(e, seek = true) {
    e.preventDefault()
    const rect = this.seekbar.getBoundingClientRect()
    const t = Math.min(Math.max(((e.clientX - rect.left) / (rect.width)), 0), 1) * this.duration()
    if (seek) this.seek_to(t)
    return t
  }

  seekbar_on_mouse_down(e) {
    if (e.buttons != 1) return
    e.preventDefault()

    if (Object.keys(this.current_video.videos).length == 0) return
    body.addEventListener("mousemove", this.seekbar._seek)
    window.addEventListener("mouseup", this.seekbar._mouseup)

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

    this.on_seek(this.seekbar._seek(e, false))

    this.seekbar.graphic.classList.toggle("seeking", false)
    this.seekbar.dial.classList.toggle("seeking", false)
    if (this.overlay_hide) { clearTimeout(this.overlay_hide) }
    this.overlay.classList.toggle("overlay_hidden", false)
    this.overlay_hide = setTimeout(() => {
      this.overlay.classList.toggle("overlay_hidden", true)
    }, 2000)
  }

  set_speed(speed) {
    this.speed = speed

    if (this.current_video.yt) {
      if (!this.current_video.yt.setPlaybackRate) return
      this.current_video.yt.setPlaybackRate(speed)
    } else {
      this.video.playbackRate = speed
    }
  }

  capture_frame(subtitles) {
    const canvas = create_element(null, "canvas")
    canvas.width = this.video.videoWidth
    canvas.height = this.video.videoHeight

    const ctx = canvas.getContext("2d")
    ctx.drawImage(this.video, 0, 0)

    if (subtitles) {
      ctx.drawImage(this.octopusInstance._canvas, 0, 0, canvas.width, canvas.height)
    }

    const image = new Image()
    image.src = canvas.toDataURL()

    const w = window.open("")
    w.document.write(image.outerHTML)
  }

  create_capture() {
    const btn_capture = create_element(this.ctxmenu, "button")
    btn_capture.textContent = "Capture Frame"
    btn_capture.addEventListener("click", () => {
      this.capture_frame(false)
    })

    const btn_capture2 = create_element(this.ctxmenu, "button")
    btn_capture2.textContent = "Capture Frame (Captions)"
    btn_capture2.addEventListener("click", () => {
      this.capture_frame(true)
    })
  }

  update_playable() {
    for (let i = 0; i < this.video.buffered.length; i++) {
      const start = this.video.buffered.start(i)
      const end = this.video.buffered.end(i)
      if ((start < this.video.currentTime || start < 1) && end > this.video.currentTime) {
        const playable = Math.round(end - this.video.currentTime)
        this.stats.playable.textContent = `${playable} seconds`
        if (this.on_playable) {
          this.on_playable(playable)
        }
        return
      }
    }

    this.stats.playable.textContent = `0 seconds`
    if (this.on_playable) {
      this.on_playable(0)
    }
  }
}

function disable_space(el) {
  el.addEventListener("keyup", e => {
    if (e.key == " ") {
      e.preventDefault()
    }
  })
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
