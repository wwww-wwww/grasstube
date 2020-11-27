import css from "../css/no_video.css"
import socket, { auth } from "./socket"

import Chat from "./grasschat"
import Playlist from "./playlist"
import Polls from "./polls"

import { hide_scrollbar } from "./drag"
import init_settings from "./settings"

console.log("room: init")
console.log("room:", socket.room)

const chat = new Chat()
const playlist = new Playlist()
const polls = new Polls()

auth(socket, [chat, playlist, polls])

init_settings()
hide_scrollbar()
