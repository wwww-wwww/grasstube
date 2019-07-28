import css from "../css/room.css"
import socket from "./socket"

import init_chat from "./grasschat"
import init_video from "./player"
import init_playlist from "./playlist"
import init_polls from "./polls"

import init_drag from "./drag"
import init_settings from "./settings"

import {get_octopus_instance, reload_vid, get_clappr_instance} from "./player"
import {playlist_on_controls} from "./playlist"
import {polls_on_controls} from "./polls"

import {reload_emotes} from "./metadata"
import {create_modal, modal_set_title} from "./modals"

console.log("init")

const room = document.getElementById("room").dataset.room

init_chat(socket, room, () => {
	polls_on_controls()
	playlist_on_controls()
})

init_video(socket, room)
init_playlist(socket, room, get_clappr_instance)
init_polls(socket, room)

init_settings(get_octopus_instance, reload_vid)
init_drag(get_octopus_instance)

btn_show_emotes.addEventListener("click", () => {
	const modal = create_modal()
	modal_set_title(modal, "emotes")
	reload_emotes(modal, chat_input)
})