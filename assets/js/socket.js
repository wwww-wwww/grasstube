import {Socket} from "phoenix"

function getMeta(metaName) {
	const metas = [...document.getElementsByTagName('meta')]
  
	for (const meta of metas) {
		if (meta.getAttribute("name") == metaName) {
			return meta.getAttribute("content")
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
