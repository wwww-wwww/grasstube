import {Socket} from "phoenix"
import {get_meta} from "./extras"

const token = get_meta("guardian_token")

const params = {}
if (token.length > 0) {
    params["params"] = {token: token}
}

const socket = new Socket("/tube", params)
socket.room = get_meta("room")

socket.onOpen(() => document.title = socket.room)

socket.onError(() => document.title = "disconnected")

socket.onClose(() => document.title = "disconnected")

socket.connect()

export default socket
