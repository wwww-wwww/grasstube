import css from "../css/no_video.css"
import socket from "./socket"

import init_chat from "./grasschat"
import init_playlist from "./playlist"
import init_polls from "./polls"

import {hide_scrollbar} from "./drag"
import init_settings from "./settings"

import {reload_emotes} from "./metadata"
import {create_modal} from "./modals"

const room = document.getElementById("room").dataset.room

console.log("room: init")
console.log("room:", room)

init_chat(socket, room)

init_playlist(socket, room)
init_polls(socket, room)

init_settings()
hide_scrollbar()

btn_show_emotes.addEventListener("click", () => {
    const modal = create_modal()
    modal.label.textContent = "emotes"
    reload_emotes(room, modal, chat_input)
})
