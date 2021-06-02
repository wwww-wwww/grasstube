import socket, { auth } from "./socket"

import { seconds_to_hms } from "./util"

import Playlist from "./playlist"

console.log("room: init")
console.log("room:", socket.room)

const playlist = new Playlist()

const video = {}
video.channel = null
video.connect = function (socket) {
  console.log("video: connecting to room " + socket.room)
  this.channel = socket.channel("video:" + socket.room, { password: socket.password })

  this.channel.on("setvid", data => {
    console.log("video: setvid", data)
    seekbar.max = data.duration
    video_duration.textContent = seconds_to_hms(data.duration, true)
  })

  this.channel.on("playing", data => {
    console.log("video: playing", data)
    button_play.textContent = data.playing ? "❚❚" : "▶"
  })

  this.channel.on("time", data => {
    console.log("video: time", data)
    seekbar.value = data.t
    video_time.textContent = seconds_to_hms(data.t, true)
  })

  this.channel.on("seek", data => {
    console.log("video: seek", data)
    seekbar.value = data.t
    video_time.textContent = seconds_to_hms(data.t, true)
  })

  this.channel.on("controls", data => {
    console.log("video: controls", data)
  })

  return this.channel.join()
    .receive("ok", resp => {
      console.log("video: connected", resp)
    })
    .receive("error", resp => {
      console.log("video: failed to connect", resp)
    })
}

button_play.addEventListener("click", () => {
  video.channel.push(button_play.textContent == "▶" ? "play" : "pause")
})

button_next.addEventListener("click", () => {
  video.channel.push("next")
})

seekbar.addEventListener("input", () => {
  video_time.textContent = seconds_to_hms(seekbar.value, true)
})

seekbar.addEventListener("change", () => {
  video.channel.push("seek", { t: Math.round(seekbar.value) })
})

auth(socket, [playlist, video])
