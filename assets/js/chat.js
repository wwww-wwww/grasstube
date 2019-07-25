import css from "../css/chat.css"
import socket from "./socket"

import init_chat from "./grasschat"

import {reload_emotes} from "./metadata"
import {create_modal, modal_set_title} from "./modals"

init_chat(socket)

btn_show_emotes.addEventListener("click", () => {
	const modal = create_modal()
	modal_set_title(modal, "emotes")
	reload_emotes(modal, chat_input)
})
