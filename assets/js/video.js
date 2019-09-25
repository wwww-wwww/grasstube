import css from "../css/video.css"
import {create_modal} from "./modals"
import GrassPlayer from "./grassplayer"
import socket from "./socket"

import init_video from "./player"

const room = document.getElementById("room").dataset.room
const player = document.getElementById("player")

const wplayer = new GrassPlayer(player)

const modal = create_modal(player)
modal.label.textContent = "this is for autoplay"

init_video(socket, room, wplayer)
