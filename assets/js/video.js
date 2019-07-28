import css from "../css/video.css"
import socket from "./socket"

import init_video from "./player"

const room = document.getElementById("room").dataset.room

init_video(socket, video)
