import { Socket } from "phoenix"
import { LiveSocket } from "phoenix_live_view"
import { create_element, enter, pad, seconds_to_hms } from "./util"
import { create_window } from "./window"
import GrassPlayer from "./grassplayer"
import Text from "./danmaku"
import init_drag from "./drag"
import init_settings from "./settings"

const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")

function autohide(msg) {
  msg.expire = null

  msg.show = n => {
    msg.classList.toggle("hidden", false)
    if (!n) return

    if (msg.expire) clearTimeout(msg.expire)

    msg.expire = setTimeout(() => {
      msg.expire = null
      if (view_chat.classList.contains("hidden")) {
        msg.classList.toggle("hidden", true)
      }
    }, n)
  }

  msg.hide = () => {
    if (!msg.expire) {
      msg.classList.toggle("hidden", true)
    }
  }

  return msg
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
}

const hooks = {
  chat: {
    mounted() {
      const room_name = document.querySelector("meta[name='room']").getAttribute("content")

      document.title = room_name

      window.addEventListener("focus", () => {
        chat_state.unread_messages = 0
        document.title = room_name
      })

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
    }
  },

  chat_submit: {
    send(message) {
      this.pushEvent("chat", { message: message })
    },
    mounted() {
      chat_state.chat = this

      chat_state.emotes_modal = create_window("chat_emotes", {
        title: null,
        root: this.root,
        show: false,
        close_on_unfocus: true,
        invert_x: true,
        invert_y: true
      })
      chat_state.emotes_modal.e.style.maxWidth = "500px"
      chat_state.emotes_modal.e.style.maxHeight = "500px"

      const chat_emotes = document.getElementById("chat_emotes")

      chat_state.emotes_modal.get_body()

      chat_state.emotes_modal.e.body_outer.classList.toggle("chat_emotes", true)
      chat_state.emotes_modal.e.body_outer.classList.toggle("thin_scrollbar", true)

      for (const emote of chat_emotes.children) {
        const new_emote = emote.cloneNode(true)
        chat_state.emotes_modal.get_body().appendChild(new_emote)
        new_emote.addEventListener("click", _ => {
          this.el.value += `:${emote.title}: `
          chat_state.emotes_modal.close()
          this.el.focus()
        })
      }

      chat_btn_emotes.addEventListener("click", () => {
        chat_state.emotes_modal.show()

        if (!chat_state.emotes_modal.moved) {
          chat_state.emotes_modal.moved = true
          const rect = maincontent.getBoundingClientRect()
          chat_state.emotes_modal.move_to(0, rect.height - this.el.offsetTop)
          chat_state.emotes_modal.moved = false
        }
      })

      this.el.addEventListener("keydown", e => enter(e, () => {
        this.send(this.el.value)
        this.el.value = ""
        chat_state.emotes_modal.close()
        if (document.getElementById("player")) {
          player.focus()
        }
      }))
    }
  },

  video: {
    current_video: null,
    fonts_complete: false,
    set_video_on_ready: null,
    mounted() {
      this.player = new GrassPlayer(
        this.el,
        [],
        document.querySelector("meta[name='controls']").getAttribute("content") == "true"
      )

      this.player.on_seek = t => {
        this.pushEvent("seek", { time: Math.round(t) })
      }

      this.player.on_toggle_playing = playing => {
        this.pushEvent(playing ? "play" : "pause", {})
      }

      this.player.on_next = () => {
        this.pushEvent("next", {})
      }

      this.handleEvent("controls", data => {
        console.log("video:controls", data)
        this.player.set_controls(data.controls)
      })

      this.handleEvent("setvid", data => {
        console.log("video: setvid", data)
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
          this.player.set_video(data.type, videos, data.sub)
        }
      })

      this.handleEvent("playing", data => {
        console.log("video: playing", data)
        if (this.player.playing != data.playing) {
          this.player.show_osd(data.playing ? "Play" : "Pause")
        }
        this.player.set_playing(data.playing)
      })

      this.handleEvent("time", data => {
        console.log("video: time", data)
        if (!this.player.playing || (
          Math.abs(data.t - this.player.current_time()) > 5 && (data.t <= this.player.duration())
        )) {
          this.player.seek(data.t)
        }
      })

      this.handleEvent("seek", data => {
        console.log("video: seek", data)
        this.player.show_osd(`${seconds_to_hms(data.t, true)}`)
        this.player.seek(data.t)
      })

      fetch("https://res.cloudinary.com/grass/raw/upload/v1648173707/fonts.json")
        .then(res => res.json())
        .then(fonts => {
          this.player.set_fonts(fonts)
          this.fonts_complete = true
        })
        .catch(err => {
          console.log("fonts: error fetching", err)
        })
        .finally(() => {
          console.log("fonts: loaded")
          if (this.set_video_on_ready) {
            this.player.set_video(this.set_video_on_ready.type, this.set_video_on_ready.videos, this.set_video_on_ready.sub)
          }
        })
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
            this.el.firstElementChild.getBoundingClientRect().y + rect.height / 2),
            this.el.lastElementChild.getBoundingClientRect().bottom - rect.height / 2)
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
    mounted() {
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

      const playlist_modal = create_window("playlist", { title: null, modal: true, show: false })
      const tab1 = playlist_modal.create_tab("hosted")
      const tab2 = playlist_modal.create_tab("youtube")

      tab1.appendChild(playlist_tab1)
      tab2.appendChild(playlist_tab2)

      playlist_btn_show.addEventListener("click", () => {
        playlist_modal.show()
      })

      this.el.addEventListener("mousedown", e => this.start_drag(e))
      this.el.addEventListener("touchstart", e => this.start_drag(e))
    }
  },

  room: {
    toggle_chat() {
      view_chat.classList.toggle("hidden")
      if (view_chat.classList.contains("hidden")) {
        for (const msg of chat_messages.children) {
          msg.hide()
        }
      } else {
        for (const msg of chat_messages.children) {
          msg.show()
        }
      }
    },
    mounted() {
      init_drag()
      init_settings()

      for (const msg of chat_messages.children) {
        autohide(msg).show(5000)
      }

      chat_state.on_message.push((msg, notify) => {
        if (notify) new Text(chat_danmaku, msg)

        autohide(msg.e).show(5000)
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

      const extra_emotes = create_window("chat_emotes2", {
        title: null,
        root: this.root,
        show: false,
        close_on_unfocus: true,
        invert_x: true,
        invert_y: true
      })

      extra_emotes.e.style.maxWidth = "500px"
      extra_emotes.e.style.maxHeight = "500px"

      const chat_emotes = document.getElementById("chat_emotes")

      extra_emotes.get_body()

      extra_emotes.e.body_outer.classList.toggle("chat_emotes", true)
      extra_emotes.e.body_outer.classList.toggle("thin_scrollbar", true)

      for (const emote of chat_emotes.children) {
        const new_emote = emote.cloneNode(true)
        extra_emotes.get_body().appendChild(new_emote)
        new_emote.addEventListener("click", _ => {
          chat_state.chat.send(`:${emote.title}:`)
          extra_emotes.close()
          player.focus()
        })
      }

      document.addEventListener("keydown", e => {
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
          if (extra_emotes.is_open()) {
            extra_emotes.close()
          } else {
            extra_emotes.show()
          }
        } else {
          nothing = true
        }

        if (!nothing) e.preventDefault()
      })
    }
  }
}

const liveSocket = new LiveSocket("/live", Socket, {
  hooks: hooks,
  params: { _csrf_token: csrfToken }
})
liveSocket.connect()
