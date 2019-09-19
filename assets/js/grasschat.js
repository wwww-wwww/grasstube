import "phoenix_html"

import {create_modal} from "./modals"
import {pad, enter} from "./extras"
import {get_cookie, set_cookie} from "./cookies"

let channel = null

let users = []
let last_chat_user = ""

function init(socket, room) {
	
	console.log("chat: connecting to room " + room)
	channel = socket.channel("chat:" + room, {})
	channel.join()
	.receive("ok", resp => {
		const nickname = get_cookie("nickname")
		if (nickname || false) set_name(nickname)
		console.log("chat: connected", resp) 
	})
	.receive("error", resp => {
		console.log("chat: failed to connect", resp)
	})

	channel.on("userlist", data => {
		console.log("chat: userlist", data)

		users = []
		while (userlist.firstChild) userlist.removeChild(userlist.firstChild)

		data.list.forEach(user => {
			users.push(user)
			const e = document.createElement("div")
			e.className = "user"

			const user_name = document.createElement("span")
			user_name.className = "user_name"
			user_name.textContent = user.nickname
			user_name.classList.toggle("mod", user.mod)
			user_name.classList.toggle("guest", user.username.length == 0)

			e.appendChild(user_name)
			userlist.appendChild(e)
		})
		user_count.textContent = data.list.length + (data.list.length > 1 ? " users connected" : " user connected")
	})

	channel.on("chat", on_chat)

	channel.on("history", on_history)

	chat_input.addEventListener("keyup", event => { enter(event, () => { chat_send_msg() }) })
	btn_userlist_toggle.addEventListener("click", e => {
		userlist.classList.toggle("hidden")
	})

	btn_chat_settings.addEventListener("click", make_change_nickname)
}

function make_change_nickname() {
	const modal = create_modal(chat_div)
	modal.label.textContent = "change your nickname"

	const modal_body = modal.get_body()
	modal_body.style.textAlign = "right"

	const textfield = document.createElement("input")
	modal_body.appendChild(textfield)

	textfield.style.display = "block"
	textfield.style.width = "100%"
	textfield.value = get_cookie("nickname") || "anon"

	const btn_set = document.createElement("button")
	modal_body.appendChild(btn_set)

	btn_set.textContent = "set"
	btn_set.style.marginTop = "0.5em"

	btn_set.addEventListener("click", () => {
		if (set_name(textfield.value.trim())) {
			chat_div.removeChild(modal)
		} else {
			textfield.focus()
			textfield.select()
		}
	})
	
	textfield.addEventListener("keyup", event => {
		event.preventDefault();
		if (event.keyCode !== 13) return;
		if (set_name(textfield.value.trim())) {
			chat_div.removeChild(modal)
		} else {
			textfield.select()
		}
	})

	textfield.focus()
	textfield.select()
}

function chat_send_msg() {
	let text = chat_input.value.trim()
	chat_input.value = ""

	if (text.length <= 0) return

	channel.push("chat", {msg: text})
}

function on_chat(data) {
	console.log("chat: chat", data)
	const msg = document.createElement("div")
	const username = document.createElement("span")
	const separator = document.createElement("span")
	separator.textContent = ": "
	username.className = "message_user"
	username.textContent = data.name

	if (data.sender == "sys") {
		msg.style.fontStyle = "italic"
		msg.appendChild(username)
		msg.appendChild(separator)
	}

	if (data.name != last_chat_user) {
		msg.style.marginTop = "4px"
		
		if (data.sender != "sys") {
			const d = new Date()
			const timestamp = document.createElement("span")
			timestamp.className = "message_timestamp"
			timestamp.textContent = "["
				+ pad(d.getHours(), 2) + ":"
				+ pad(d.getMinutes(), 2) + ":"
				+ pad(d.getSeconds(), 2) + "] "

			msg.appendChild(timestamp)
			msg.appendChild(username)
			msg.appendChild(separator)
		}
	last_chat_user = data.name
	}


	const message_content = document.createElement("span")
	message_content.className = "message_content"
	msg.appendChild(message_content)
	
	if (data.content.indexOf("&gt;") == 0) {
		message_content.style.color = "#789922"
	}

	message_content.innerHTML = data.content

	messages.appendChild(msg)
	messages.scrollTop = messages.scrollHeight
}

function on_history(data) {
	console.log("chat: history", data)
	
	data.list.reverse().forEach(message => {
		const msg = document.createElement("div")
		const username = document.createElement("span")
		const separator = document.createElement("span")
		separator.textContent = ": "
		username.className = "message_user"

		if (last_chat_user != message.name) {
			msg.style.marginTop = "4px"
			
			username.textContent = message.name

			msg.appendChild(username)
			msg.appendChild(separator)
		}

		last_chat_user = message.name

		const message_content = document.createElement("span")
		message_content.className = "message_content"
		msg.appendChild(message_content)
		
		if (message.msg.indexOf("&gt;") == 0) {
			message_content.style.color = "#789922"
		}

		message_content.innerHTML = message.msg

		messages.appendChild(msg)
		messages.scrollTop = messages.scrollHeight

	})

	messages.appendChild(document.createElement("hr"))
}

function set_name(name) {
	if (name.length > 0) {
		if (name != "anon") {
			set_cookie("nickname", name)
		}
		
		channel.push("setname", {name: name})
		return true
	} else {
		return false
	}
}

export default init
