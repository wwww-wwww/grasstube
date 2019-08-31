import {Socket} from "phoenix"

function getMeta(metaName) {
	const metas = [...document.getElementsByTagName('meta')]
  
	for (const i in metas) {
		if (metas[i].getAttribute("name") == metaName) {
			return metas[i].getAttribute("content")
		}
	}
  
	return ""
}

const token = getMeta("guardian_token")

const params = {}
if (token.length > 0) {
	params["params"] = {token: token}
}
const socket = new Socket("/tube", params)
socket.connect()

export default socket
