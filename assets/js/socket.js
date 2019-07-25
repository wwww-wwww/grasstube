import {Socket} from "phoenix"

let socket = new Socket("/tube")
socket.connect()

export default socket
