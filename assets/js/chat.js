import css from "../css/chat.scss"
import socket, { auth } from "./socket"

import Chat from "./grasschat"

const chat = new Chat(chat_container, chat_input, chat_messages, true, chat_userlist, document.createElement("div"), chat_emotes)

auth(socket, [chat])
