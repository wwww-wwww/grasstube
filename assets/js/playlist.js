import "phoenix_html"
import {create_modal} from "./modals"
import {reload_hosted_videos} from "./metadata"
import {seconds_to_hms, enter} from "./extras"

let channel = null
const playlist = []
let has_controls = false

function init(socket, room) {

	console.log("playlist: connecting to room " + room)
	channel = socket.channel("playlist:" + room, {})
	channel.join()
	.receive("ok", resp => {
		console.log("playlist: connected", resp) 
	})
	.receive("error", resp => {
		console.log("playlist: failed to connect", resp)
	})

	let current_video = -1

	channel.on("playlist", data => {
		console.log("playlist: playlist", data)
		playlist.length = 0
		while (playlist_container.firstChild) playlist_container.removeChild(playlist_container.firstChild)
		
		if (data.playlist.length <= 0) {
			playlist_header_count.textContent = "playlist is empty"
			playlist_header_time.textContent = ""
		} else {
			playlist_header_count.textContent = data.playlist.length + " item" + ((data.playlist.length == 1) ? "" : "s")
			let time = 0
			for (let i = 0; i < data.playlist.length; i++) {
				const vid = data.playlist[i]

				time += vid.duration

				const e = document.createElement("div")
				e.className = "playlist_item"

				vid.title_e = document.createElement("a")
				vid.title_e.className = "playlist_item_title"
				e.appendChild(vid.title_e)
				
				vid.title_e.textContent = vid.title
				if (vid.url.length > 0) {
					vid.title_e.href = vid.url
				}
		
				vid.duration_e = document.createElement("span")
				vid.duration_e.className = "playlist_item_duration"
				vid.duration_e.textContent = seconds_to_hms(vid.duration)

				vid.q_set = document.createElement("button")
				vid.q_set.className = "playlist_set"
				vid.q_set.textContent = "set"
				vid.q_del = document.createElement("button")
				vid.q_del.className = "playlist_remove square"
				vid.q_del.textContent = "×"

				vid.q_set.addEventListener("click", queue_set)
				vid.q_del.addEventListener("click", queue_remove)
		
				vid.q_del.classList.toggle("hidden", !has_controls)
				vid.q_set.classList.toggle("hidden", !has_controls)

				e.prepend(vid.q_del)
				e.append(vid.duration_e)
				e.append(vid.q_set)
		
				e.classList.toggle("isactive", vid.id == current_video)

				vid.e = e
				playlist_container.appendChild(e)
				playlist.push(vid)
			}
			playlist_header_time.textContent = seconds_to_hms(time)
			
		}
	})

	channel.on("current", data => {
		console.log("playlist: current", data)

		current_video = data.id
		playlist.forEach(vid => {
			vid.e.classList.toggle("isactive", current_video == vid.id)
		})
	})

	channel.on("controls", data => {
		console.log("playlist: controls", data)
		has_controls = true
	
		playlist_controls.classList.toggle("hidden", false)

		playlist.forEach(vid => {
			vid.q_set.classList.toggle("hidden", false)
			vid.q_del.classList.toggle("hidden", false)
		})
	})
	
	playlist_add.addEventListener("click", queue_add)

	add_url.addEventListener("keyup", event => { enter(event, () => { queue_add() }) })
	add_sub.addEventListener("keyup", event => { enter(event, () => { queue_add() }) })

	btn_show_hosted_videos.addEventListener("click", () => {
		const modal = create_modal()
		modal.label.textContent = "hosted videos"
		reload_hosted_videos(modal, channel, "https://okea.moe/video/list.json")
	})

	btn_show_ss.addEventListener("click", () => {
		const modal = create_modal()
		modal.label.textContent = "ss"
		reload_hosted_videos(modal, channel, "https://okea.moe/ss/list.json")
	})
}

function add_ss(e) {
	if (ss.length <= 1 &&
		(e.selectedIndex - 1) < ss.length) return

	const vid = ss[e.target.selectedIndex - 1]
	add_url.value = vid["url"]
	add_sub.value = vid["sub"]
	e.target.selectedIndex = 0
}

/*
function toggle_playing() {
	channel.push("toggle_playing")
}

function set_seek() {
	if (get_clappr_instance() != null)
		channel.push("seek", {t: (seekbar.value / 1000) * get_clappr_instance().getDuration() })
}
*/

function queue_add() {
	channel.push("q_add", {
		url: add_url.value,
		sub: add_sub.value
	})

	add_url.value = ""
	add_sub.value = ""
}

function queue_set(e) {
	for (let i = 0; i < playlist.length; i++) {
		if (playlist[i].q_set == e.target) {
			channel.push("q_set", {id: playlist[i].id})
			break;
		}
	}
}

function queue_remove(e) {
	for (let i = 0; i < playlist.length; i++) {
		if (playlist[i].q_del == e.target) {
			channel.push("q_del", {id: playlist[i].id})
			break;
		}
	}
}

/*
function queue_next() {
	channel.push("q_next")
}
*/

export default init
