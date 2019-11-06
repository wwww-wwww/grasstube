import css from "../css/chat.css"
import socket, { auth } from "./socket"

import Chat from "./grasschat"

const chat = new Chat()

auth(socket, [chat])
