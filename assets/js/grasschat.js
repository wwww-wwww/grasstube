import "phoenix_html"

import { Presence } from "phoenix"

import reload_emotes from "./emotes"
import { pad, enter, create_element } from "./util"
import { get_cookie, set_cookie } from "./cookies"
import { create_window } from "./window"

class Message {
  constructor(data) {
    this.data = data
    this.e = create_element(null, "div")
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

    const separator = create_element(null, "span")
    separator.textContent = ": "

    this.e.prepend(separator)
    this.e.prepend(username)
  }
}

class Chat {
  constructor(root, chat_input, messages, reverse, userlist, btn_chat_settings, btn_show_emotes) {
    this.root = root
    this.chat_input = chat_input
    this.chat_messages = messages
    this.messages = []
    this.history = null
    this.reverse = reverse
    this.userlist = userlist
    this.socket = null
    this.channel = null
    this.users = []
    this.last_chat_user = ""
    this.unread_messages = 0

    this.on_message = []

    chat_input.addEventListener("keydown", event => { enter(event, () => this.send_msg()) })

    window.addEventListener("focus", () => {
      this.unread_messages = 0
      if (this.socket) {
        document.title = this.socket.room
      }
    })

    this.emotes_modal = create_window("chat_emotes", {
      title: null,
      root: this.root,
      show: false,
      close_on_unfocus: true,
      invert_x: true,
      invert_y: true
    })
    this.emotes_modal.e.style.maxWidth = "500px"
    this.emotes_modal.e.style.maxHeight = "500px"
    this.emotes_modal.get_body()
    this.emotes_modal.e.body_outer.classList.toggle("thin_scrollbar", true)

    btn_show_emotes.addEventListener("click", () => {
      reload_emotes(this.socket.room, this.emotes_modal, emote => {
        this.chat_input.value += `:${emote}: `
        this.emotes_modal.close()
        this.chat_input.focus()
      })
      this.emotes_modal.show()

      if (!this.emotes_modal.moved) {
        this.emotes_modal.moved = true
        const rect = this.root.getBoundingClientRect()
        this.emotes_modal.move_to(0, rect.height - this.chat_input.offsetTop)
        this.emotes_modal.moved = false
      }
    })
  }

  connect(socket) {
    this.socket = socket
    document.title = this.socket.room

    console.log("chat: connecting to room", socket.room)
    const channel = socket.channel(`chat:${socket.room}`, { password: socket.password })
    this.channel = channel
    const presence = new Presence(channel)
    presence.onSync(() => this.repaint_userlist())

    channel.on("chat", data => this.on_chat(data, true))
    channel.on("clear", _ => this.on_clear())
    channel.on("history", data => this.on_history(data))

    return channel.join()
      .receive("ok", resp => {
        console.log("chat: connected", resp)
        this.channel = channel
        this.presence = presence

        const nickname = get_cookie("nickname")
        if (nickname) this.set_name(nickname)
      })
      .receive("error", resp => {
        console.log("chat: failed to connect", resp)
      })
  }

  send_msg() {
    this.send(chat_input.value.trim())
    chat_input.value = ""
  }

  send(text) {
    if (text.length <= 0) return
    console.log(this.channel)
    console.log("chat: send message", this.channel.push("chat", { msg: text }))
  }

  repaint_userlist() {
    console.log("chat: new presence", this.presence.list())
    this.users = []
    while (this.userlist.firstChild) this.userlist.removeChild(this.userlist.firstChild)
    this.presence.list((_id, user) => {
      this.users.push(user)

      const nickname = user.member ? user.nickname : user.metas[0].nickname

      const e = create_element(this.userlist, "div", "user")

      const user_name = create_element(e, "span", "user_name")
      user_name.textContent = nickname

      user_name.classList.toggle("mod", user.mod || false)
      user_name.classList.toggle("guest", !user.member)
    })
  }

  on_clear() {
    console.log("chat: cleared chat")
    while (this.chat_messages.firstChild) {
      this.chat_messages.removeChild(this.chat_messages.firstChild)
    }
    this.messages = []
  }

  on_chat(data, notify) {
    console.log("chat: chat", data)

    const msg = new Message(data)
    this.messages.push(msg)

    if (this.reverse) {
      this.chat_messages.prepend(msg.e)
    } else {
      this.chat_messages.appendChild(msg.e)
    }

    if (data.sender != "sys") {
      //notify browser title
      if (notify && !document.hasFocus()) {
        this.unread_messages = this.unread_messages + 1
        document.title = `${this.unread_messages} • ${this.socket.room}`
      }
    }

    if (data.name != this.last_chat_user) {
      if (this.last_chat_user.length != 0) {
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
      this.last_chat_user = data.name
    }

    this.on_message.forEach(fn => fn(msg, notify))

    return msg
  }

  set_name(name) {
    if (name.length > 0) {
      if (name != "anon") {
        set_cookie("nickname", name)
      }

      this.channel.push("setname", { name: name })
      return true
    } else {
      return false
    }
  }

  on_history(data) {
    console.log("chat: history", data)

    if (this.history) return
    this.history = data

    data.list.reverse().forEach(message => {
      this.on_chat(message, false)
    })

    const msg = this.on_chat({ sender: "sys", name: "", msg: "<hr>" }, false)
    msg.e.classList.toggle("flex", true)
    msg.message_content.style.background = "none"
  }
}

export default Chat
