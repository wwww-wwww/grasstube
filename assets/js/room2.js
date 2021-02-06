import "../css/room2.scss"
import socket, { auth } from "./socket"

import GrassPlayer from "./grassplayer"

import Chat from "./grasschat2"
import Video from "./player"
import Playlist from "./playlist"
import Polls from "./polls"

import init_drag from "./drag"
import init_settings from "./settings"
import Text from "./danmaku"

console.log("room: init")
console.log("room:", socket.room)

const player = document.getElementById("player")
const wplayer = new GrassPlayer(player, [], false)

const chat = new Chat(container_video, chat_input, chat_messages, true, chat_userlist, document.createElement("div"), chat_emotes)
const video = new Video(wplayer)
const playlist = new Playlist()
const polls = new Polls()

function close_chat() {
  chat_input_container.classList.toggle("hidden", true)
  chat_userlist.classList.toggle("hidden", true)
  chat_messages.classList.toggle("clickable", false)
  chat.messages.forEach(message => { message.hide() })
}

document.addEventListener("keydown", e => {
  switch (e.key) {
    case "Enter":
      e.preventDefault()
      if (chat_input_container.classList.contains("hidden")) {
        chat.messages.forEach(message => { message.show() })
        chat_input_container.classList.toggle("hidden", false)
        chat_userlist.classList.toggle("hidden", false)
        chat_messages.classList.toggle("clickable", true)
        chat_input.focus()
      } else {
        close_chat()
        player.focus()
      }
      break;
  }
})

chat_input.addEventListener("keydown", e => {
  if (e.key == "Escape") {
    chat_input.value = ""
    close_chat()
  }
})

chat.on_message.push((msg, notify) => {
  if (notify) {
    new Text(chat_danmaku, msg)
  }

  msg.expire = null

  msg.show = n => {
    msg.e.classList.toggle("hidden", false)
    if (!n) return

    if (msg.expire) {
      clearTimeout(msg.expire)
    }
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
