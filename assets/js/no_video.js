import css from "../css/no_video.scss"
import socket, { auth } from "./socket"

import Chat from "./grasschat"
import Playlist from "./playlist"
import Polls from "./polls"

import init_drag from "./drag"
import init_settings from "./settings"

console.log("room: init")
console.log("room:", socket.room)

const chat = new Chat(chat_container, chat_input, chat_messages, true, chat_userlist, document.createElement("div"), chat_emotes)
const playlist = new Playlist()
const polls = new Polls()

auth(socket, [chat, playlist, polls])

init_settings()
init_drag()
