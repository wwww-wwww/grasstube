import {modal_get_body} from "./modals"

const emotes = {}
const hosted_videos = {}

function reload_emotes(modal, chatbox) {
	if (modal == null || modal == undefined) return
	if (Object.keys(emotes).length <= 0) {
		for (const emote in emotes) delete emotes[emote]
		
		fetch("/emotelist.json", { headers: { "Content-Type": "application/json; charset=utf-8" }})
		.then(res => res.json())
		.then(data => {
			for (const emote in data) emotes[emote] = data[emote]
			reload_emotes(modal, chatbox)
			console.log("emotes: fetched")
		})
		.catch(err => {
			console.log("emotes: error fetching", err)
		});
	}
	
	const modal_body = modal_get_body(modal)
	modal_body.style.textAlign = "center"
	while (modal_body.firstChild) modal_body.removeChild(modal_body.firstChild)
	for	(const emote in emotes) {
		const emote_img = document.createElement("img")
		emote_img.src = emotes[emote]
		emote_img.alt = emote
		emote_img.title = emote
		emote_img.style.padding = "4px"
		emote_img.style.maxHeight = "100px"
		emote_img.addEventListener("click", () => {
			chatbox.value += emote + " "
			body.removeChild(modal)
			chatbox.focus()
		})
		modal_body.appendChild(emote_img)
	}
}

function reload_hosted_videos(modal, channel, url, download=true) {
	if (modal == null || modal == undefined) return
	if (download) {
		$.ajax({
			url: url,
			context: document.body,
			cache: false,
			success: data => {
				if (!(url in hosted_videos) || data != hosted_videos[url]) {
					hosted_videos[url] = data
					reload_hosted_videos(modal, channel, url, false)
				}
			}
		})
		return
	}
	
	const modal_body = modal_get_body(modal)
	while (modal_body.firstChild) modal_body.removeChild(modal_body.firstChild)
	hosted_videos[url].forEach(v => {
		const item = document.createElement("div")
		item.className = "list-item"

		const title = document.createElement("span")
		title.textContent = v.title
		title.style.marginRight = "4px"
		item.appendChild(title)

		const btn_add = document.createElement("button")
		btn_add.textContent = "add"
		btn_add.style.float = "right"

		btn_add.addEventListener("click", () => {
			channel.push("q_add", {
				url: v.url,
				sub: v.sub,
				small: v.small
			})
		})

		item.appendChild(btn_add)
		
		modal_body.appendChild(item)
	})
	
}

export {reload_emotes, reload_hosted_videos}
