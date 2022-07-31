import { Socket } from "phoenix"
import { LiveSocket } from "phoenix_live_view"
import { create_element, enter, get_meta, pad, seconds_to_hms } from "./util"
import { create_window } from "./window"
import GrassPlayer from "./grassplayer"
import Text from "./danmaku"
import { init_drag, destroy_drag } from "./drag"
import init_settings from "./settings"
import topbar from "../vendor/topbar"

function autohide(msg, duration) {
  msg.classList.toggle("visible", true)

  setTimeout(() => msg.classList.toggle("visible", false), duration)
}

class Message {
  constructor(data) {
    this.data = data
    this.e = create_element(null, "div", "message")
    this.expire = null
    this.hidden = true

    if (data.content == undefined) {
      data.content = data.msg
    }

    if (data.sender == "sys") {
      this.e.style.fontStyle = "italic"
    }

    this.message_content = create_element(this.e, "div", "message_content")

    if (data.content.indexOf("&gt;") == 0) {
      this.message_content.style.color = "#789922"
    }

    this.message_content.innerHTML = data.content
  }

  insert_name() {
    const username = create_element(null, "span", "message_user")
    username.textContent = this.data.name

    this.e.prepend(username)
  }
}

const chat_state = {
  unread_messages: 0,
  last_chat_user: "",
  on_message: [],
  chat: null,
  emotes_modal: null,
  on_load: null,
}

const player_state = {
  player: null,
  fullscreen_element: null,
}

const hooks = {
  chat: {
    focus: null,
    send(message) {
      this.pushEvent("chat", { message: message })
    },
    mounted() {
      window.__chat = this
      chat_state.chat = this

      const room_name = get_meta("chat_room")

      document.title = room_name

      this.focus = () => {
        chat_state.unread_
        messages = 0
        document.title = room_name
      }
      window.addEventListener("focus", this.focus)

      this.handleEvent("chat", data => {
        console.log("chat:chat", data)
        const msg = new Message(data)

        chat_messages.prepend(msg.e)

        if (data.sender != "sys") {
          //notify browser title
          if (!document.hasFocus()) {
            chat_state.unread_messages = chat_state.unread_messages + 1
            document.title = `${chat_state.unread_messages} • ${room_name}`
          }
        }

        if (data.name != chat_state.last_chat_user) {
          if (chat_state.last_chat_user.length != 0) {
            msg.e.style.marginTop = "0.5em"
          }

          if (data.sender != "sys") {
            msg.insert_name()
            const d = new Date()
            const timestamp = create_element(null, "span")
            timestamp.className = "message_timestamp"
            timestamp.textContent = "["
              + pad(d.getHours(), 2) + ":"
              + pad(d.getMinutes(), 2) + ":"
              + pad(d.getSeconds(), 2) + "] "
            msg.e.prepend(timestamp)
          }
          chat_state.last_chat_user = data.name
        }

        chat_state.on_message.forEach(fn => fn(msg, true))
      })

      this.handleEvent("clear", data => {
        console.log("chat:clear", data)
        while (chat_messages.firstChild) {
          chat_messages.removeChild(chat_messages.firstChild)
        }
      })

      chat_state.emotes_modal = create_window("chat_emotes", {
        title: null,
        root: this.root,
        show: false,
        close_on_unfocus: true,
        invert_x: true,
        invert_y: true,
        classes: "chat_emotes thin_scrollbar"
      })

      const chat_emotes = document.getElementById("chat_emotes")

      for (const emote of chat_emotes.children) {
        const new_emote = emote.cloneNode(true)
        chat_state.emotes_modal.appendChild(new_emote)
        new_emote.addEventListener("click", _ => {
          chat_input.value += `:${emote.title}: `
          chat_state.emotes_modal.close()
          chat_input.focus()
        })
      }

      chat_btn_emotes.addEventListener("click", () => {
        chat_state.emotes_modal.show()

        if (!chat_state.emotes_modal.moved) {
          chat_state.emotes_modal.moved = true
          const rect = maincontent.getBoundingClientRect()
          chat_state.emotes_modal.move_to(0, rect.height - chat_input.offsetTop)
          chat_state.emotes_modal.moved = false
        }
      })

      chat_input.addEventListener("keydown", e => enter(e, () => {
        this.send(chat_input.value)
        chat_input.value = ""
        chat_state.emotes_modal.close()
        if (document.getElementById("player")) {
          player.focus()
        }
      }))

      if (chat_state.on_load) {
        chat_state.on_load()
        chat_state.on_load = null
      }
    },
    destroyed() {
      delete document.windows["chat_emotes"]
      chat_state.chat = null
      window.__chat = null
      window.removeEventListener("focus", this.focus)
    }
  },

  video: {
    current_video: null,
    fonts_complete: false,
    set_video_on_ready: null,
    ping_time: null,
    latency_rtt: 0,
    ping_interval: null,
    stats_latency: null,
    ping() {
      this.ping_time = Date.now()
      if (!document.hidden) { console.log("video:ping") }
      this.pushEvent("ping", {}, () => {
        const latency = (Date.now() - this.ping_time)
        this.latency_rtt = latency * 0.75 + (this.latency_rtt || latency) * 0.25
        this.stats_latency.textContent = this.latency_rtt.toFixed(2) + "ms"
        if (!document.hidden) { console.log("video:pong", this.latency_rtt) }
      })
    },
    mounted() {
      player_state.player = new GrassPlayer(
        this.el,
        [],
        get_meta("controls") == "true"
      )
      window.grassplayer = player_state.player

      if (player_state.fullscreen_element) {
        player_state.player.fullscreen_element = player_state.fullscreen_element
      }

      player_state.player.on_seek = t => {
        this.pushEvent("seek", { time: t })
      }

      player_state.player.on_toggle_playing = playing => {
        this.pushEvent(playing ? "play" : "pause", { offset: -this.latency_rtt / 1000 })
      }

      player_state.player.on_next = () => {
        this.pushEvent("next", {})
      }

      player_state.player.on_playable = buffered => {
        this.pushEvent("buffered", { buffered: buffered })
      }

      this.stats_latency = player_state.player.stats_add_row("Latency (RTT):", this.latency_rtt)

      this.ping()
      this.ping_interval = setInterval(() => this.ping(), 5000)

      this.handleEvent("controls", data => {
        console.log("video:controls", data)
        player_state.player.set_controls(data.controls)
      })

      this.handleEvent("setvid", data => {
        console.log("video:setvid", data)
        if (this.current_video == data) return
        this.current_video = data
        let videos = {}
        if (data.type == "default") {
          if (data.url.length > 0) {
            videos["normal"] = data.url
          }
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
          player_state.player.set_video(data.type, videos, data.sub)
        }

        if (data.playing) this.on_playing(data)
        if (data.t) this.on_seek(data)
      })

      this.on_playing = data => {
        if (data.playing == undefined) return
        if (player_state.player.playing != data.playing) {
          player_state.player.show_osd(data.playing ? "Play" : "Pause")
          if (data.playing) {
            const offset_time = data.t + this.latency_rtt / 1000
            if (Math.abs(offset_time - player_state.player.current_time()) > 0.1) {
              console.log("video:play offset", this.latency_rtt / 1000)
              player_state.player.seek(offset_time)
            }
          }
        }
        player_state.player.set_playing(data.playing)
      }

      this.handleEvent("sync", data => {
        console.log("video:sync", data)

        this.on_playing(data)

        if (data.t) {
          if (player_state.player.playing) {
            const offset_time = data.t + this.latency_rtt / 1000
            if (offset_time >= player_state.player.duration()) { return }
            if (Math.abs(offset_time - player_state.player.current_time()) > 5) {
              console.log("video:time offset", this.latency_rtt / 1000)
              player_state.player.seek(offset_time)
            }
          } else {
            console.log("video:time", data)
            player_state.player.seek(data.t)
          }
        }

        if (data.speed) {
          if (data.speed != player_state.player.speed) {
            player_state.player.show_osd(`Speed: ${data.speed}`)
          }
          player_state.player.set_speed(data.speed)
        }
      })

      this.on_seek = data => {
        if (Math.abs(data.t - player_state.player.current_time()) > 0.1) {
          console.log("video:seek", data)
          player_state.player.show_osd(`${seconds_to_hms(data.t, true)}`)
          player_state.player.seek(data.t)
        }
      }

      this.handleEvent("seek", data => this.on_seek(data))

      fetch("https://res.cloudinary.com/grass/raw/upload/v1657065293/fonts.json")
        .then(res => res.json())
        .then(fonts => {
          player_state.player.set_fonts(fonts)
          this.fonts_complete = true
        })
        .catch(err => {
          console.log("fonts:error fetching", err)
        })
        .finally(() => {
          console.log("fonts:loaded")
          if (this.set_video_on_ready) {
            player_state.player.set_video(this.set_video_on_ready.type, this.set_video_on_ready.videos, this.set_video_on_ready.sub)
          }
        })
    },
    destroyed() {
      clearInterval(this.ping_interval)
      player_state.player = null
    }
  },

  playlist: {
    start_drag(e) {
      const target = e.touches ? e.touches[0].target : e.target
      if (!(target.tagName == "BUTTON" && target.classList.contains("playlist_drag"))) {
        return
      }

      target.parentElement.classList.toggle("dragging", true)
      document.addEventListener("mouseup", e => this.stop_drag(e))
      document.addEventListener("mousemove", e => this.drag(e))
      document.addEventListener("touchend", e => this.stop_drag(e))
      document.addEventListener("touchmove", e => this.drag(e))
    },
    stop_drag(_) {
      const order = []
      for (const item of this.el.children) {
        order.push(parseInt(item.dataset.id))
        item.style.transform = "none"
        item.classList.toggle("dragging", false)
      }

      this.pushEvent("order", { order: order })

      document.removeEventListener("mouseup", e => this.stop_drag(e))
      document.removeEventListener("mousemove", e => this.drag(e))
      document.removeEventListener("touchend", e => this.stop_drag(e))
      document.removeEventListener("touchmove", e => this.drag(e))
    },
    drag(e) {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      for (let i = 0; i < this.el.children.length; i++) {
        const el = this.el.children[i]

        if (el.classList.contains("dragging")) {
          el.style.transform = "none"

          let rect = el.getBoundingClientRect()
          let mouse_y = Math.min(Math.max(clientY,
            this.el.firstElementChild.getBoundingClientRect().y),
            this.el.lastElementChild.getBoundingClientRect().bottom)
          let y = rect.y
          let off = mouse_y - y - rect.height / 2

          for (let j = i - 1; j <= i + 1; j++) { // only 1 before and after
            if (j < 0 || j == i || j >= this.el.children.length) continue
            const el2 = this.el.children[j]
            if ((j < i && mouse_y <= (el2.getBoundingClientRect().y + el2.getBoundingClientRect().height / 2)) ||
              (j > i && mouse_y >= (el2.getBoundingClientRect().y + el2.getBoundingClientRect().height / 2))) {
              if (j < i) {
                this.el.insertBefore(el, el2)
              } else {
                this.el.insertBefore(el2, el)
              }

              rect = el.getBoundingClientRect()
              y = rect.y
              off = mouse_y - y - rect.height / 2
              break
            }
          }

          el.style.transform = `translate(0, ${off}px)`
          break
        }
      }
    },
    yt_search(query) {
      this.pushEvent("yt_search", { query: query }, reply => {
        if (!reply.success) { return }
        while (playlist_yt_list.firstChild) playlist_yt_list.removeChild(playlist_yt_list.firstChild)

        for (const video of reply.items) {
          const video_url = `https://youtube.com/watch?v=${video.id}`

          const video_e = create_element(playlist_yt_list, "div", "yt-video")

          const video_e_thumbnail = create_element(video_e, "img")
          video_e_thumbnail.style.height = "6em"
          video_e_thumbnail.src = `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`

          let column = create_element(video_e, "div")

          const video_e_title = create_element(column, "a")
          video_e_title.textContent = video.title
          video_e_title.href = video_url

          const video_e_author = create_element(column, "a")
          video_e_author.textContent = video.channel_title
          video_e_author.href = `https://youtube.com/channel/${video.channel_id}`

          const video_add = create_element(video_e, "button")
          video_add.textContent = "Add"

          video_add.addEventListener("click", () => {
            this.pushEvent("add", {
              title: "",
              url: video_url,
              sub: "",
              alts: "{}"
            })
          })
        }
      })
    },
    yt_search_timeout: null,
    unload: null,
    mounted() {
      window.__playlist = this

      const script = get_meta("playlist_script")

      if (script) {
        const scripts = new Function(script)()
        scripts.load(this)
        this.unload = scripts.unload
      }

      playlist_add.addEventListener("click", () => {
        this.pushEvent("add", {
          title: playlist_add_title.value,
          url: playlist_add_url.value,
          sub: playlist_add_sub.value,
          alts: playlist_add_small.value
        })
        playlist_add_title.value = ""
        playlist_add_url.value = ""
        playlist_add_sub.value = ""
        playlist_add_small.value = ""
      })

      playlist_yt_input.addEventListener("keydown", e => {
        if (playlist_yt_input.value.length <= 0) { return }
        if (this.yt_search_timeout) { clearTimeout(this.yt_search_timeout) }

        if (e.key == "Enter") {
          this.yt_search(playlist_yt_input.value)
        } else {
          this.yt_search_timeout = setTimeout(() => {
            this.yt_search(playlist_yt_input.value)
          }, 1000)
        }
      })

      const playlist_modal = create_window("playlist", { title: null, modal: true, show: false })
      const tab1 = playlist_modal.create_tab("Hosted")
      const tab2 = playlist_modal.create_tab("YouTube")

      tab1.appendChild(playlist_tab1)
      tab2.appendChild(playlist_tab2)

      playlist_btn_show.addEventListener("click", () => {
        playlist_modal.show()
      })

      this.el.addEventListener("mousedown", e => this.start_drag(e))
      this.el.addEventListener("touchstart", e => this.start_drag(e))
    },
    destroyed() {
      if (this.unload) {
        this.unload()
        this.unload = null
      }
      window.__playlist = null
      delete document.windows["playlist"]
    }
  },

  room: {
    extra_emotes: null,
    toggle_chat() {
      view_chat.classList.toggle("hidden")
      if (view_chat.classList.contains("hidden")) {
        btn_open_chat.textContent = "Open chat"
      } else {
        btn_open_chat.textContent = "Close chat"
      }
    },
    load() {
      for (const msg of chat_messages.children) {
        autohide(msg, 5000)
      }

      chat_state.on_message.push((msg, notify) => {
        if (notify) new Text(chat_danmaku, msg)

        autohide(msg.e, 5000)
      })

      chat_input.addEventListener("keydown", e => {
        if (!view_chat.classList.contains("hidden") && e.key == "Escape") {
          e.preventDefault()
          chat_input.value = ""
          this.toggle_chat()
          chat_state.emotes_modal.close()
          player.focus()
        }
      })

      btn_open_chat.addEventListener("click", () => {
        this.toggle_chat()
      })

      this.extra_emotes = create_window("chat_emotes2", {
        title: null,
        root: this.el,
        show: false,
        close_on_unfocus: true,
        invert_x: true,
        invert_y: true,
        classes: "chat_emotes thin_scrollbar"
      })

      const chat_emotes = document.getElementById("chat_emotes")

      for (const emote of chat_emotes.children) {
        const new_emote = emote.cloneNode(true)
        this.extra_emotes.appendChild(new_emote)
        new_emote.addEventListener("click", _ => {
          chat_state.chat.send(`:${emote.title}:`)
          this.extra_emotes.close()
          player.focus()
        })
      }
    },
    on_keydown: null,
    unload: null,
    mounted() {
      init_settings()
      init_drag()

      const script = get_meta("room_script")

      if (script) {
        const scripts = new Function(script)()
        scripts.load(this)
        this.unload = scripts.unload
      }

      if (player_state.player) {
        player_state.player.fullscreen_element = this.el
      } else {
        player_state.fullscreen_element = this.el
      }

      if (document.getElementById("chat_container")) {
        this.load()
      } else {
        chat_state.on_load = () => this.load()
      }

      this.on_keydown = e => {
        const chat_open = !view_chat.classList.contains("hidden")
        if (e.target.tagName == "INPUT" && e.target != chat_input) return
        let nothing = false

        if (e.key == "Enter") {
          this.toggle_chat()
          if (chat_open) {
            player.focus()
          } else {
            chat_input.focus()
          }
        } else if (e.key == "\\" && !chat_open) {
          this.toggle_chat()
          chat_btn_emotes.click()
          chat_input.focus()
        } else if (e.key == "e" && !chat_open) {
          if (this.extra_emotes.is_open()) {
            this.extra_emotes.close()
          } else {
            this.extra_emotes.show()
          }
        } else {
          nothing = true
        }

        if (!nothing) e.preventDefault()
      }

      document.addEventListener("keydown", this.on_keydown)
    },
    destroyed() {
      if (this.unload) {
        this.unload()
        this.unload = null
      }
      chat_state.on_message = []
      destroy_drag()
      delete document.windows["Settings"]
      delete document.windows["chat_emotes2"]
      document.removeEventListener("keydown", this.on_keydown)
    }
  },

  create_poll: {
    mounted() {
      this.el.addEventListener("click", () => {
        this.create_poll_modal()
      })
    },
    create_choice(choices, choices_list) {
      const choice = {}

      choice.e = create_element(choices_list, "div")
      choice.name = create_element(choice.e, "input")
      choice.del = create_element(choice.e, "button", "square icon")
      choice.del.textContent = "clear"

      choice.del.addEventListener("click", () => {
        choices.forEach(c => {
          if (c.del == choice.del) {
            choices_list.removeChild(choice.e)
            choices.splice(choices.indexOf(c), 1)
          }
        })
      })

      choices.push(choice)
      return choice
    },
    create_poll_modal() {
      const modal = create_window(null, { title: "Create a poll", classes: "poll_modal" })

      const poll_title = create_element(modal, "input")
      poll_title.placeholder = "Title"

      const choices_list = create_element(modal, "div", "choices")

      const choices = []
      this.create_choice(choices, choices_list)

      const poll_add_choice = create_element(modal, "button")
      poll_add_choice.textContent = "Add another choice"

      poll_add_choice.addEventListener("click", () => {
        this.create_choice(choices, choices_list).name.focus()
      })

      const poll_create = create_element(modal, "button")
      poll_create.textContent = "Create"

      poll_create.addEventListener("click", () => {
        const final_title = poll_title.value.trim()
        if (final_title.length <= 0) { return }
        if (choices.length <= 0) { return }

        const final_choices = []
        choices.forEach(e => {
          const choice = e.name.value.trim()
          if (choice.length > 0) {
            final_choices.push(choice)
          }
        })

        if (final_choices.length <= 0) { return }

        this.pushEvent("add", { title: final_title, choices: final_choices })

        modal.close()
      })

      modal.show()
      poll_title.focus()
    }
  }
}

topbar.config({ barColors: { 0: "#29d" }, shadowColor: "rgba(0, 0, 0, .3)" })
let topBarScheduled = undefined
window.addEventListener("phx:page-loading-start", () => {
  if (!topBarScheduled) {
    topBarScheduled = setTimeout(() => topbar.show(), 120)
  }
})

window.addEventListener("phx:page-loading-stop", () => {
  clearTimeout(topBarScheduled)
  topBarScheduled = undefined
  topbar.hide()
})

const liveSocket = new LiveSocket("/live", Socket, {
  hooks: hooks,
  params: { _csrf_token: get_meta("csrf-token") }
})
liveSocket.connect()
window.liveSocket = liveSocket
