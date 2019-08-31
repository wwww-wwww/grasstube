import css from "../css/room.css"
import socket from "./socket"

import GrassPlayer from "./grassplayer"

import init_chat from "./grasschat"
import init_video from "./player"
import init_playlist from "./playlist"
import init_polls from "./polls"

import init_drag from "./drag"
import init_settings from "./settings"

import {reload_emotes} from "./metadata"
import {create_modal, modal_set_title} from "./modals"

const room = document.getElementById("room").dataset.room

console.log("init")
console.log("room", room)

const player = document.getElementById("player")
const wplayer = new GrassPlayer(player)

init_chat(socket, room)

const modal = create_modal(player)
modal_set_title(modal, "this is for autoplay")
init_video(socket, room, wplayer)

init_playlist(socket, room)
//init_polls(socket, room)

init_settings()
init_drag()

btn_show_emotes.addEventListener("click", () => {
	const modal = create_modal()
	modal_set_title(modal, "emotes")
	reload_emotes(room, modal, chat_input)
})