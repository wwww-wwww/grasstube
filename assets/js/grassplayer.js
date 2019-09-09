import {seconds_to_hms} from "./extras"
import {get_cookie, set_cookie} from "./cookies"

class GrassPlayer {

	constructor(attach) {
		this.fonts = []

		const yt = document.createElement("script")
		yt.src = "https://www.youtube.com/iframe_api"
		document.head.appendChild(yt)
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
		this.octopusInstance = null
		
		this.settings = {}
		this.settings.default_quality = get_cookie("video_quality") || "big"
		this.settings.volume = (Math.pow(10, (get_cookie("video_volume") || 20) / 100) - 1) / 9
		
		this.playing_message = document.createElement("div")
		this.playing_message.textContent = "nothing is playing"
		this.playing_message.style.position = "absolute"
		this.playing_message.style.textAlign = "center"
		this.playing_message.style.width = "100%"
		attach.appendChild(this.playing_message)

		this.video = document.createElement("video")
		this.video.id = "video"
		this.video.className = "player_video"
		this.video.volume = this.settings.volume

		this.video2 = document.createElement("div")
		this.video2.id = "video2"
		this.video2.className = "player_video"

		this.overlay = document.createElement("div")
		this.overlay.className = "player_overlay player_overlay_hidden"
		
		attach.appendChild(this.video)
		attach.appendChild(this.video2)
		attach.appendChild(this.overlay)

		const bottom_shade = document.createElement("div")
		bottom_shade.style.position = "absolute"
		bottom_shade.style.width = "100%"
		bottom_shade.style.height = "3em"
		bottom_shade.style.bottom = "0"
		bottom_shade.style.background = "rgba(0, 0, 0, 0.5)"
		this.overlay.appendChild(bottom_shade)

		this.btn_play = document.createElement("button")
		this.btn_play.textContent = "▶"
		this.btn_play.className = "player_btn"
		this.btn_play.disabled = true

		bottom_shade.appendChild(this.btn_play)

		this.btn_play.addEventListener("click", () => {
			if (this.btn_play.textContent == "▶") {
				this.btn_play.textContent = "❚❚"
				this.on_toggle_playing(true)
			} else {
				this.btn_play.textContent = "▶"
				this.on_toggle_playing(false)
			}
		})
		
		this.btn_next = document.createElement("button")
		this.btn_next.className = "player_btn"
		this.btn_next.style.fontSize = "1em"
		this.btn_next.textContent = "▶❙"
		bottom_shade.appendChild(this.btn_next)

		this.on_next = void 0
		this.btn_next.addEventListener("click", () => {
			this.on_next()
		})

		this.slider_volume = document.createElement("input")
		this.slider_volume.className = "player_volume"
		this.slider_volume.type = "range"
		this.slider_volume.min = 0
		this.slider_volume.max = 100
		this.slider_volume.step = 1
		this.slider_volume.value = (get_cookie("video_volume") || 20)
		bottom_shade.appendChild(this.slider_volume)

		this.slider_volume.addEventListener("input", () => {
			set_cookie("video_volume", this.slider_volume.value)
			this.settings.volume = (Math.pow(10, this.slider_volume.value / 100) - 1) / 9
			if (this.current_video.yt) this.current_video.yt.setVolume(this.settings.volume * 100)
			this.video.volume = this.settings.volume
		})

		this.lbl_time = document.createElement("span")
		this.lbl_time.className = "player_time"
		this.lbl_time.textContent = "00:00 / 00:00"
		bottom_shade.appendChild(this.lbl_time)

		const right_side = document.createElement("div")
		right_side.style.float = "right"
		bottom_shade.appendChild(right_side)

		this.btn_cc = document.createElement("button")
		this.btn_cc.className = "player_btn player_btn_cc hidden"

		const _cc = get_cookie("video_cc")
		if (_cc == null) this.btn_cc.checked = true
		else this.btn_cc.checked = get_cookie("video_cc")

		this.btn_cc.classList.toggle("player_btn_toggle_on", this.btn_cc.checked)

		this.btn_cc.textContent = "CC"
		right_side.appendChild(this.btn_cc)

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
			} else {
				if (this.btn_cc.checked) {
					this.octopusInstance = new SubtitlesOctopus({
						video: this.video,
						subUrl: this.current_video.subs,
						fonts: this.fonts,
						workerUrl: '/includes/subtitles-octopus-worker.js'
					})
				} else {
					try{
						this.octopusInstance.dispose()
					}
					catch(e) {}
					this.octopusInstance = null
				}
			}
		})

		this.select_quality = document.createElement("select")
		this.select_quality.className = "player_select_quality hidden"
		right_side.appendChild(this.select_quality)

		this.select_quality.addEventListener("change", () => {
			this.video.src = this.current_video.videos[this.select_quality.value]
			set_cookie("video_quality", this.select_quality.value)
		})

		this.btn_fullscreen = document.createElement("button")
		this.btn_fullscreen.className = "player_btn"
		this.btn_fullscreen.textContent = "⛶"
		right_side.appendChild(this.btn_fullscreen)
		
		this.btn_fullscreen.addEventListener("click", () => {
			if (document.fullscreenElement) document.exitFullscreen()
			else attach.requestFullscreen()
		})

		this.on_toggle_playing = void 0
		this.on_seek = void 0
		create_seekbar(this)

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
		this.playing_message.textContent = "nothing is playing"

		if (this.octopusInstance) {
			try{
				this.octopusInstance.dispose()
			}
			catch(e) {}
			this.octopusInstance = null
		}

		while (this.select_quality.firstChild)
			this.select_quality.removeChild(this.select_quality.firstChild)
		
		this.select_quality.classList.toggle("hidden", true)

		if (Object.keys(videos).length == 0) {
			this.btn_play.disabled = true
			return
		}

		this.playing_message.textContent = ""
		this.btn_play.disabled = false

		if (type == "yt") {
			this.set_youtube(videos)
		} else {
			if (this.settings.default_quality in videos) {
				this.video.src = videos[this.settings.default_quality]
			} else {
				for (const video in videos) {
					this.video.src = videos[video]
					break
				}
			}
			if (Object.keys(videos).length > 1) {
				this.select_quality.classList.toggle("hidden", false)
				for (const video in videos) {
					const opt = document.createElement("option")
					opt.textContent = video
					this.select_quality.appendChild(opt)
				}
			}
			if (this.btn_cc.checked) {
				this.octopusInstance = new SubtitlesOctopus({
					video: this.video,
					subUrl: subs,
					fonts: this.fonts,
					workerUrl: '/includes/subtitles-octopus-worker.js'
				})
			}
		}
	}

	set_playing(playing) {
		this.seekbar.paused = !playing
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

		this.seekbar.paused = !playing
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

	toggle_controls(controls) {
		this.btn_play.classList.toggle("hidden", !controls)
		this.btn_next.classList.toggle("hidden", !controls)
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

	set_fonts(fonts) {
		this.fonts = fonts
	}

	current_time() {
		return (this.current_video.yt && this.current_video.yt.getCurrentTime) ? this.current_video.yt.getCurrentTime() : this.video.currentTime
	}

	duration() {
		return (this.current_video.yt && this.current_video.yt.getDuration) ? this.current_video.yt.getDuration() : this.video.duration
	}
}

function create_seekbar(player) {
	const seekbar = document.createElement("div")
	seekbar.className = "player_seekbar"

	player.overlay.appendChild(seekbar)

	player.seekbar = seekbar

	seekbar.graphic = document.createElement("div")
	seekbar.graphic.className = "player_seekbar_bar"

	seekbar.appendChild(seekbar.graphic)

	seekbar.buffers = []

	seekbar.current = document.createElement("div")
	seekbar.current.style.position = "absolute"
	seekbar.current.style.width = "0%"
	seekbar.current.style.height = "100%"
	seekbar.current.style.background = "rgba(0, 70, 255, 0.6)"
	seekbar.current.style.pointerEvents = "none"
	seekbar.current.style.zIndex = "1"
	
	seekbar.graphic.appendChild(seekbar.current)

	seekbar.dial = document.createElement("div")
	seekbar.dial.className = "player_seekbar_dial"
	
	seekbar.appendChild(seekbar.dial)
	
	seekbar.paused = false

	seekbar._seek = e => { return seekbar_mouse_move(e, player) }
	seekbar._mouseup = e => {
		e.preventDefault()
		player.seeking = false
		if (Object.keys(player.current_video.videos).length == 0) return
		body.removeEventListener("mousemove", seekbar._seek)
		body.removeEventListener("mouseup", seekbar._mouseup)

		if (!seekbar.paused) 
			if (player.current_video.yt) player.current_video.yt.playVideo()
			else player.video.play()

		const t = seekbar._seek(e)
		player.on_seek(t)
		seekbar.graphic.classList.toggle("seeking", false)
		seekbar.dial.classList.toggle("seeking", false)
		if (player.overlay_hide) clearTimeout(player.overlay_hide)
		player.overlay.classList.toggle("player_overlay_hidden", false)
		player.overlay_hide = setTimeout(() => {
			player.overlay.classList.toggle("player_overlay_hidden", true)
		}, 2000)
	}

	seekbar.addEventListener("mousedown", e => {
		e.preventDefault()
		if (Object.keys(player.current_video.videos).length == 0) return
		body.addEventListener("mousemove", seekbar._seek)
		body.addEventListener("mouseup", seekbar._mouseup)

		if (player.current_video.yt)
			seekbar.paused = player.current_video.yt.getPlayerState() != 1
		else
			seekbar.paused = player.video.paused

		player.seeking = true
		
		if (player.current_video.yt)
			player.current_video.yt.pauseVideo()
		else
			player.video.pause()

		seekbar._seek(e)
		seekbar.graphic.classList.toggle("seeking", true)
		seekbar.dial.classList.toggle("seeking", true)
	})

	seekbar.set_buffers = (buffers, duration) => {
		while (seekbar.buffers.length < buffers.length) {
			const buffer = document.createElement("div")
			buffer.style.position = "absolute"
			buffer.style.width = "0%"
			buffer.style.height = "100%"
			buffer.style.background = "rgba(255, 255, 255, 0.3)"
			buffer.style.pointerEvents = "none"
			buffer.style.zIndex = "0"
			seekbar.buffers.push(buffer)
			seekbar.graphic.appendChild(buffer)
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

export default GrassPlayer
