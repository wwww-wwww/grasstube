import { Socket } from "phoenix"
import { LiveSocket } from "phoenix_live_view"
import { create_element, pad, enter } from "./util"

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

const room_name = document.querySelector("meta[name='room']").getAttribute("content")

const chat_state = {
  unread_messages: 0,
  last_chat_user: "",
  on_message: []
}

const hooks = {
  chat: {
    mounted() {
      console.log(this)
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
  }
}

const liveSocket = new LiveSocket("/live", Socket, {
  hooks: hooks,
  params: { _csrf_token: csrfToken }
})
liveSocket.connect()
