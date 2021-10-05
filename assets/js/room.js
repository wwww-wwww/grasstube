import socket, { auth } from "./socket"

import GrassPlayer from "./grassplayer"

import Chat from "./grasschat"
import Video from "./player"
import Playlist from "./playlist"
import Polls from "./polls"

import init_drag from "./drag"
import init_settings from "./settings"
import Text from "./danmaku"

import { create_window } from "./window"

import reload_emotes from "./emotes"

console.log("room: init")
console.log("room:", socket.room)

const player = document.getElementById("player")
const wplayer = new GrassPlayer(player, [], false)
document.wplayer = wplayer

const chat = new Chat(chat_container, chat_input, chat_messages, true, chat_userlist, document.createElement("div"), chat_emotes)
const video = new Video(wplayer)
const playlist = new Playlist()
const polls = new Polls()

function open_chat() {
  chat.messages.forEach(message => { message.show() })
  chat_input_container.classList.toggle("hidden", false)
  chat_userlist.classList.toggle("hidden", false)
  chat_messages.classList.toggle("clickable", true)
  chat_container.classList.toggle("clickable", true)
  chat_input.focus()
  btn_open_chat.textContent = "Close chat"
}

function close_chat() {
  chat.emotes_modal.close()
  chat_input_container.classList.toggle("hidden", true)
  chat_userlist.classList.toggle("hidden", true)
  chat_messages.classList.toggle("clickable", false)
  chat_container.classList.toggle("clickable", false)
  chat.messages.forEach(message => { message.hide() })
  btn_open_chat.textContent = "Open chat"
}

const emotes = create_window("chat_emotes2", {
  title: null,
  root: chat_container,
  show: false,
  close_on_unfocus: true
})
emotes.e.style.pointerEvents = "all"
emotes.e.style.maxWidth = "500px"
emotes.e.style.maxHeight = "500px"

function open_emotes() {
  reload_emotes(chat.socket.room, emotes, emote => {
    chat.send(`:${emote}:`)
    emotes.close()
  })
  emotes.show()
  emotes.e.body_outer.classList.toggle("thin_scrollbar", true)
}

btn_open_chat.addEventListener("click", () => {
  if (chat_input_container.classList.contains("hidden")) {
    open_chat()
  } else {
    close_chat()
  }
})

document.addEventListener("keydown", e => {
  const chat_open = !chat_input_container.classList.contains("hidden")
  if (e.target.tagName == "INPUT" && e.target != chat_input) return
  let nothing = false

  if (e.key == "Enter") {
    if (chat_open) {
      close_chat()
      player.focus()
    } else {
      open_chat()
    }
  } else if (e.key == "\\" && !chat_open) {
    open_chat()
    chat_emotes.click()
  } else if (e.key == "e" && !chat_open) {
    emotes.is_open() ? emotes.close() : open_emotes()
  } else {
    nothing = true
  }

  if (!nothing) e.preventDefault()
})

chat_input.addEventListener("keydown", e => {
  if (e.key == "Escape") {
    e.preventDefault()
    chat_input.value = ""
    close_chat()
  }
})

chat.on_message.push((msg, notify) => {
  if (notify) new Text(chat_danmaku, msg)

  msg.expire = null

  msg.show = n => {
    msg.e.classList.toggle("hidden", false)
    if (!n) return

    if (msg.expire) clearTimeout(msg.expire)

    msg.expire = setTimeout(() => {
      msg.expire = null
      if (chat_input_container.classList.contains("hidden")) {
        msg.e.classList.toggle("hidden", true)
      }
    }, n)
  }

  msg.hide = () => {
    if (!msg.expire) {
      msg.e.classList.toggle("hidden", true)
    }
  }

  msg.show(5000)
})

auth(socket, [chat, video, playlist, polls])

init_settings()
init_drag()
