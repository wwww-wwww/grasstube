import socket, { auth } from "./socket"

import Chat from "./grasschat"

const chat = new Chat()

auth(socket, [chat])
