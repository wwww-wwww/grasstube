import css from "../css/room.css"
import socket, { auth } from "./socket"

import GrassPlayer from "./grassplayer"

import Chat from "./grasschat"
import Video from "./player"
import Playlist from "./playlist"
import Polls from "./polls"

import init_drag from "./drag"
import init_settings from "./settings"

console.log("room: init")
console.log("room:", socket.room)

const player = document.getElementById("player")
const wplayer = new GrassPlayer(player, [], false)

const chat = new Chat()
const video = new Video(wplayer)
const playlist = new Playlist()
const polls = new Polls()

auth(socket, [chat, video, playlist, polls])

init_settings()
init_drag()
