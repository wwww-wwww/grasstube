import {create_modal, modal_set_title} from "./modals"
import {get_cookie} from "./cookies"

const fonts = []
let channel = null
let clappr = undefined
let octopusInstance = undefined

let seek = 0
let current_video = null

function init(socket, room) {
	fetch("/fonts/list.txt", { headers: { "Content-Type": "text/plain; charset=utf-8" }})
		.then(res => res.text())
		.then(data => {
			data.split("\n").forEach(font => { if (font.length > 0) fonts.push("/fonts/" + font) })
			console.log("fonts: fetched")
			connect(socket, room)
		})
		.catch(err => {
			console.log("fonts: error fetching", err)
		});

	const modal = create_modal(player)
	modal_set_title(modal, "this is for autoplay")
}

function connect(socket, room) {
	console.log("video: connecting to room " + room)
	channel = socket.channel("video:" + room, {})
	channel.join()
		.receive("ok", resp => {
			console.log("video: connected", resp) 
		})
		.receive("error", resp => {
			console.log("video: failed to connect", resp)
		})


	channel.on("setvid", data => {
		console.log("video: setvid", data)
		if (data.url.length <= 0) current_video = null
		else current_video = data
		reload_vid()
	})

	channel.on("playing", data => {
		console.log("video: playing", data)
		player_on_playing(data)
	})
	
	channel.on("seek", data => {
		console.log("video: seek", data)
		player_on_seek(data)
	})
}

function get_octopus_instance() {
	return octopusInstance
}

function reload_vid() {
	if (current_video == null) {
		if (clappr) clappr.destroy()
	}
	else {
		if (current_video.small && (get_cookie().lq || false))
			player_change_source(current_video.type, current_video.small, current_video.sub)
		else
			player_change_source(current_video.type, current_video.url, current_video.sub)
	}
}

let on_playing = void 0
let on_seek = void 0

function player_on_playing(data) {
	if (on_playing)
		on_playing(data.playing)
	if (document.getElementById("btn_playpause")) btn_playpause.textContent = data.playing ? "pause" : "play"

	if (!clappr) return
	if (data.playing && !clappr.isPlaying() &&
		(seek < clappr.getDuration() || 
		clappr.getDuration() == 0))
			clappr.play()
	if (!data.playing && clappr.isPlaying()) clappr.pause()
}

function player_on_seek(data) {
	if (on_seek)
		on_seek((seek / clappr.getDuration()) * 1000)

	if (!clappr) return
	seek = data.t
	if (clappr.getDuration() == 0) return
	if (clappr.getCurrentTime() >= clappr.getDuration() &&
		clappr.isPlaying())
			clappr.pause()
	if ((Math.abs(clappr.getCurrentTime() - seek) > 5 &&
		seek < clappr.getDuration()))
			clappr.seek(seek)

	if (document.getElementById("seekbar")) seekbar.value = (seek / clappr.getDuration()) * 1000
}


function httpRequest(opts) {
	document.xmlHttpRequest(opts)
}

function player_change_source(type, file_video, file_subs, options={}) {
	if (clappr) clappr.destroy()
	if (file_video.length <= 0) return
	
	switch(type) {
		case "yt":
			options.poster = 'https://i.ytimg.com/vi/' + file_video + '/hqdefault.jpg'
			options.plugins = [YoutubePlugin, YoutubePluginControl]
			options.youtubeShowRelated = false
			options.YoutubeVars = {
				"languageCode": "en",
				"cc_load_policy": 0
				}
			options.events = {
				onPlay: () => {
					clappr.setVolume(clappr.getVolume())
				}
			}
		case "default":
			break
		case "gdrive":
			const url = "https://docs.google.com/get_video_info?authuser="
                + "&docid=" + file_video
                + "&sle=true"
				+ "&hl=en"

			httpRequest({
				method: 'GET',
				url: url,
				onload: resp => {
					resp = resp.responseText
					const data = {};

					resp.split('&').forEach(kv => {
						const pair = kv.split('=')
						data[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1])
					})

					if (data.status === 'fail') {
						console.log("Google Drive request failed: " +
							unescape(data.reason).replace(/\+/g, ""))
					}

					if (!data.fmt_stream_map) {
						alert(
							"Google has removed the video streams associated" +
							" with this item.  It can no longer be played."
						)
					}

					data.links = {}
					data.fmt_stream_map.split(',').forEach(function (item) {
						const pair = item.split('|')
						data.links[pair[0]] = pair[1]
					})

					const gdrive_link = (get_cookie().lq || false) ? 
						(data.links[37] ||
						data.links[22] || 
						data.links[59] ||
						data.links[18]) :
						(data.links[18] ||
						data.links[59] || 
						data.links[22] ||
						data.links[37])
						
					console.log(gdrive_link)
					
					options.mimeType = "video/mp4"
					
					player_change_source("default", gdrive_link, file_subs, options)
				}
			})
		default:
			return
	}
	
	options.source = file_video
	options.height = "100%"
	options.width = "100%"

	clappr = new Clappr.Player(options)
	clappr.attachTo(player)

	if (file_subs.length > 0) {
		const video = player.getElementsByTagName("video")[0] || player.getElementsByTagName("iframe")[0]
		let options = {
			video: video,
			subUrl: file_subs,
			fonts: fonts,
			workerUrl: '/includes/subtitles-octopus-worker.js'
		}
		octopusInstance = new SubtitlesOctopus(options)
	}

}

function get_clappr_instance() {
	return clappr
}

export {reload_vid, get_octopus_instance, get_clappr_instance}
export default init
