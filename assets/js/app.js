import { Socket } from "phoenix"
import { LiveSocket } from "phoenix_live_view"
import { create_element, pad, enter } from "./util"
import { seconds_to_hms } from "./util"
import GrassPlayer from "./grassplayer"

const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")

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
  on_message: []
}

const hooks = {
  chat: {
    mounted() {
      const room_name = document.querySelector("meta[name='room']").getAttribute("content")

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
            document.title = `${this.unread_messages} • ${room_name}`
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
    mounted() {
      this.el.addEventListener("keydown", e => enter(e, () => {
        this.pushEvent("chat", { message: this.el.value })
        this.el.value = ""
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
  }
}

const liveSocket = new LiveSocket("/live", Socket, {
  hooks: hooks,
  params: { _csrf_token: csrfToken }
})
liveSocket.connect()
