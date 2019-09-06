import css from "../css/chat.css"
import socket from "./socket"

import init_chat from "./grasschat"

import {reload_emotes} from "./metadata"
import {create_modal, modal_set_title} from "./modals"

const room = document.getElementById("room").dataset.room

init_chat(socket, room)

btn_show_emotes.addEventListener("click", () => {
	const modal = create_modal()
	modal_set_title(modal, "emotes")
	reload_emotes(room, modal, chat_input)
})
