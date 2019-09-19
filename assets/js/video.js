import css from "../css/video.css"
import {create_modal} from "./modals"
import GrassPlayer from "./grassplayer"
import socket from "./socket"

import init_video from "./player"

const room = document.getElementById("room").dataset.room
const player = document.getElementById("player")

const piacere = "https://youtu.be/KrapzeD00w8"

const wplayer = new GrassPlayer(player)
//wplayer.set_videos({"yt": piacere})

const modal = create_modal(player)
modal.label.textContent = "this is for autoplay"

init_video(socket, room, wplayer)
