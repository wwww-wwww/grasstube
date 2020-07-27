import GrassPlayer from "./grassplayer"
import socket, { auth } from "./socket"

import Video from "./player"

const player = document.getElementById("player")

const wplayer = new GrassPlayer(player, [], false)
const video = new Video(wplayer)

auth(socket, [video])
