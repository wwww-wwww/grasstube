import { Socket, Presence } from "phoenix"
import { LiveSocket } from "phoenix_live_view"
import { create_element, enter, get_meta, pad, seconds_to_hms } from "./util"
import { create_window } from "./window"
import { get_cookie } from "./cookies"
import GrassPlayer from "./grassplayer"
import Text from "./danmaku"
import { init_drag, destroy_drag } from "./drag"
import init_settings from "./settings"
import topbar from "../vendor/topbar"
import load_media_directories from "./media_directories"

import { ready } from "./ready"

function autohide(msg, duration) {
  msg.classList.toggle("visible", true)

  setTimeout(() => msg.classList.toggle("visible", false), duration)
}

class Message {
  constructor(data) {
    this.data = data
    this.e = create_element(null, "div", "message")
    this.expire = null
    this.hidden = true

    if (data.content == undefined) {
      data.content = data.msg
    }

    if (data.sender == "sys") {
      this.e.style.fontStyle = "italic"
    }

    this.message_content = create_element(this.e, "div", "message_content")

    if (data.content.indexOf("&gt;") == 0) {
      this.message_content.style.color = "#789922"
    }

    this.message_content.innerHTML = data.content
  }

  insert_name() {
    const username = create_element(null, "span", "message_user")
    username.textContent = this.data.name

    this.e.prepend(username)
  }
}


const room = {
  script: null,
  room: null,
  video: null,
}

function load_script() {
  console.log("load_script")
  const script = get_meta("room_script")

  if (script) {
    room.script = new Function(script)()
    if (room.room) {
      if (room.script.room_load) {
        room.script.room_load(room.room)
      }
      room.room = null
    }
    if (room.video) {
      if (room.script.video_load) {
        room.script.video_load(room.video)
      }
      room.video = null
    }
  }
}

window.room = room

window.create_window = create_window
window.create_element = create_element

const chat_state = {
  unread_messages: 0,
  last_chat_user: "",
  on_message: null,
  chat: null,
  emotes_modal: null,
  on_load: null,
  autohide: false
}
window.chat_state = chat_state

const player_state = {
  player: null,
  fullscreen_element: null,
}
window.player_state = player_state

const hooks = {
  chat: {
    user_id: null,
    focus: null,
    send(message) {
      this.pushEvent("chat", { message: message })
    },
    mounted() {
      window.__chat = this
      chat_state.chat = this

      const room_name = get_meta("chat_room")

      document.title = room_name

      this.focus = () => {
        chat_state.unread_
        messages = 0
        document.title = room_name
      }
      window.addEventListener("focus", this.focus)

      this.handleEvent("chat", data => {
        console.log("chat:chat", data)

        if (!ready(data, this)) return

        let script_message = 0

        if (room.script && room.script.on_message) {
          script_message = room.script.on_message(data)
        }

        if (script_message < 1 && chat_state.on_message) chat_state.on_message(data)

        if (script_message < 2) {
          const msg = new Message(data)
          if (chat_state.autohide) autohide(msg.e, 5000)

          chat_messages.prepend(msg.e)

          if (data.sender != "sys") {
            //notify browser title
            if (!document.hasFocus()) {
              chat_state.unread_messages = chat_state.unread_messages + 1
              document.title = `${chat_state.unread_messages} • ${room_name}`
            }
          }

          if (data.name != chat_state.last_chat_user) {
            if (chat_state.last_chat_user.length != 0) {
              msg.e.style.marginTop = "0.5em"
            }

            if (data.sender != "sys") {
              msg.insert_name()
              const d = new Date()
              const timestamp = create_element(null, "span")
              timestamp.className = "message_timestamp"
              timestamp.textContent = "["
                + pad(d.getHours(), 2) + ":"
                + pad(d.getMinutes(), 2) + ":"
                + pad(d.getSeconds(), 2) + "] "
              msg.e.prepend(timestamp)
            }
            chat_state.last_chat_user = data.name
          }
        }
      })

      this.handleEvent("clear", data => {
        console.log("chat:clear", data)
        while (chat_messages.firstChild) {
          chat_messages.removeChild(chat_messages.firstChild)
        }
      })

      this.handleEvent("user", data => {
        console.log("chat:user", data)
        this.user_id = data.user_id
      })

      chat_state.emotes_modal = create_window("chat_emotes", {
        title: null,
        root: this.el,
        show: false,
        close_on_unfocus: true,
        invert_x: true,
        invert_y: true,
        classes: "chat_emotes thin_scrollbar"
      })

      const chat_emotes = document.getElementById("chat_emotes")

      for (const emote of chat_emotes.children) {
        const new_emote = emote.cloneNode(true)
        chat_state.emotes_modal.appendChild(new_emote)
        new_emote.addEventListener("click", _ => {
          chat_input.value += `:${emote.title}: `
          chat_state.emotes_modal.close()
          chat_input.focus()
        })
      }

      chat_btn_emotes.addEventListener("click", () => {
        chat_state.emotes_modal.show()

        if (!chat_state.emotes_modal.moved) {
          chat_state.emotes_modal.moved = true
          const rect = maincontent.getBoundingClientRect()
          chat_state.emotes_modal.move_to(0, rect.height - chat_input.offsetTop)
          chat_state.emotes_modal.moved = false
        }
      })

      chat_input.addEventListener("keydown", e => enter(e, () => {
        this.send(chat_input.value)
        chat_input.value = ""
        chat_state.emotes_modal.close()
        if (document.getElementById("player")) {
          player.focus()
        }
      }))

      if (chat_state.on_load) {
        chat_state.on_load()
        chat_state.on_load = null
      }
    },
    destroyed() {
      delete document.windows["chat_emotes"]
      chat_state.chat = null
      window.__chat = null
      window.removeEventListener("focus", this.focus)
    }
  },

  video: {
    current_video: null,
    fonts_complete: false,
    set_video_on_ready: null,
    ping_time: null,
    latency_rtt: 0,
    last_ping: 0,
    ping_interval: null,
    stats_latency: null,
    catchup_mul: 1,
    catchup_target: null,
    catchup_target_time: null,
    catchup_interval: null,
    stats_catchup: null,
    speed: 1,
    mount_loaded: false,
    ping() {
      this.ping_time = Date.now()
      if (!document.hidden) { console.info("video:ping") }
      this.pushEvent("ping", {}, () => {
        this.last_ping = (Date.now() - this.ping_time) * 10
        this.latency_rtt = this.last_ping * 0.25 + (this.latency_rtt || this.last_ping) * 0.75
        this.stats_latency.textContent = this.latency_rtt.toFixed(2) + "ms"
        if (!document.hidden) { console.info("video:pong", this.last_ping) }
        if (!this.mount_loaded) {
          // response from ping should always be after setvid
          this.pushEvent("getvid", {}, data => {
            console.log("video:getvid", data)
            this.mount_loaded = true
            if (Object.keys(data).length == 0) return
            this.set_video(data)
          })
        }
      })
    },
    set_video(data) {
      if (room.script) {
        if (room.script.on_set_video) {
          room.script.on_set_video(data)
        }
      }
      this.mount_loaded = true
      if (this.current_video == data) return
      this.current_video = data
      let videos = {}
      if (data.type == "default") {
        if (data.url.length > 0) {
          videos["normal"] = data.url
        }
        for (const alt in data.alts) {
          videos[alt] = data.alts[alt]
        }
      } else {
        videos = data.url
      }
      if (!this.fonts_complete) {
        this.set_video_on_ready = { type: data.type, videos: videos, sub: data.sub || "" }
      } else {
        player_state.player.set_video(data.type, videos, data.sub || "")
      }

      if (data.playing) this.on_playing(data)
      if (data.t) this.on_seek(data)
    },
    mounted() {
      player_state.player = new GrassPlayer(
        this.el,
        [],
        get_meta("controls") == "true"
      )
      window.grassplayer = player_state.player

      if (player_state.fullscreen_element) {
        player_state.player.fullscreen_element = player_state.fullscreen_element
      }

      player_state.player.on_seek = t => {
        this.pushEvent("seek", { time: t })
        this.catchup_target = t
        this.catchup_target_time = Date.now()

        if (player_state.player.playing) {
          clearInterval(this.catchup_interval)
          clearTimeout(this.catchup_timeout)
          this.catchup_timeout = setTimeout(() => {
            console.log("video:catchup start")
            this.catchup_interval = setInterval(() => this.run_catchup(), 20)
          }, 200)
        }
      }

      player_state.player.on_toggle_playing = playing => {
        this.pushEvent(playing ? "play" : "pause", { offset: -this.latency_rtt / 1000 })
      }

      player_state.player.on_next = () => {
        this.pushEvent("next", {})
      }

      let last_buffered = 0

      player_state.player.on_playable = buffered => {
        if (buffered == last_buffered) return
        last_buffered = buffered
        this.pushEvent("buffered", { buffered: buffered })
      }

      this.stats_latency = player_state.player.stats_add_row("Latency (RTT):", this.latency_rtt)
      this.stats_catchup = player_state.player.stats_add_row("Catchup mul:", `${this.catchup_mul}x`)
      player_state.player.settings.set("catchup", get_cookie("catchup", true))
      player_state.player.add_setting("catchup", "Catchup")

      this.handleEvent("autopause", data => {
        console.log("video:autopause", data)
        this.pushEvent("buffered", { buffered: last_buffered })
      })

      this.handleEvent("controls", data => {
        console.log("video:controls", data)
        player_state.player.set_controls(data.controls)
      })

      this.handleEvent("setvid", data => {
        console.log("video:setvid", data)
        this.set_video(data)
      })

      this.ping()
      this.ping_interval = setInterval(() => this.ping(), 2000)

      this.on_playing = data => {
        if (data.playing == undefined) return

        const current_state = player_state.player.playing

        if (player_state.player.playing != data.playing) {
          player_state.player.show_osd(data.playing ? "Play" : "Pause")
          player_state.player.set_playing(data.playing)
        }

        if (!current_state && !data.playing) {
          player_state.player.seek(data.t)
          player_state.player.set_playing(false)
          return
        }

        const offset_time = data.t + Math.min(this.latency_rtt / 1000, 1)
        if (offset_time >= player_state.player.duration()) return

        this.catchup_target = offset_time
        this.catchup_target_time = Date.now()

        if (current_state != data.playing) {
          if (Math.abs(offset_time - player_state.player.current_time()) > 0.1) {
            player_state.player.seek(offset_time)
          }

          clearInterval(this.catchup_interval)
          clearTimeout(this.catchup_timeout)
          this.catchup_timeout = setTimeout(() => {
            console.log("video:catchup start")
            this.catchup_interval = setInterval(() => this.run_catchup(), 20)
          }, 200)
        }

        if (Math.abs(offset_time - player_state.player.current_time()) > 5) {
          player_state.player.show_osd("CHECK THE CONSOLE")
          console.error("something went horribly wrong", {
            last_ping: this.last_ping,
            latency: this.latency_rtt / 1000,
            data: data,
            offset_time: offset_time,
            current_time: player_state.player.current_time(),
          })
          //player_state.player.seek(offset_time)
        }
      }

      this.run_catchup = () => {
        if (player_state.player == null || !player_state.player.settings.catchup) {
          clearInterval(this.catchup_interval)
          return
        }
        if (this.catchup_target == null || !player_state.player.playing) return
        const elapsed = (Date.now() - this.catchup_target_time) / 1000
        const dist = (this.catchup_target + elapsed) - player_state.player.current_time()

        if (Math.abs(dist) < 0.02) {
          this.catchup_mul = 1
          console.log("video:catchup end")
          clearInterval(this.catchup_interval)
        } else {
          const dir = dist > 0 ? 1 : -1
          this.catchup_mul = 1 + dir * (dist > 0.5 ? 0.1 : 0.05)
        }

        player_state.player.set_speed(this.speed * this.catchup_mul)
        this.stats_catchup.textContent = `${dist.toFixed(5)} ${this.catchup_mul.toFixed(5)}x`
      }

      this.catchup_interval = null
      this.catchup_timeout = null

      this.handleEvent("sync", data => {
        console.info("video:sync", data)

        this.on_playing(data)

        if (data.speed) {
          if (data.speed != this.speed) {
            player_state.player.show_osd(`Speed: ${data.speed}`)
          }
          this.speed = data.speed
          player_state.player.set_speed(this.speed * this.catchup_mul)
        }
      })

      this.on_seek = data => {
        this.catchup_target = null
        this.catchup_target_time = null

        let offset_time = data.t
        if (player_state.player.playing) {
          offset_time += Math.min(this.latency_rtt / 1000, 1)
        }

        if (offset_time >= player_state.player.duration()) return

        if (Math.abs(offset_time - player_state.player.current_time()) < 0.1)
          return

        console.log("video:seek", data)
        player_state.player.show_osd(seconds_to_hms(data.t, true))
        player_state.player.seek(offset_time)

        if (player_state.player.playing) {
          this.catchup_target = offset_time
          this.catchup_target_time = Date.now()
          clearInterval(this.catchup_interval)
          clearTimeout(this.catchup_timeout)
          this.catchup_timeout = setTimeout(() => {
            console.log("video:catchup start")
            this.catchup_interval = setInterval(() => this.run_catchup(), 20)
          }, 200)
        }
      }

      this.handleEvent("seek", data => this.on_seek(data))

      fetch("https://r2tube.grass.moe/fonts.json")
        .then(res => res.json())
        .then(fonts => {
          player_state.player.set_fonts(fonts)
          this.fonts_complete = true
        })
        .catch(err => {
          console.log("fonts:error fetching", err)
        })
        .finally(() => {
          console.log("fonts:loaded")
          if (this.set_video_on_ready) {
            player_state.player.set_video(this.set_video_on_ready.type, this.set_video_on_ready.videos, this.set_video_on_ready.sub)
          }
        })

      room.video = this
      load_script()
    },
    destroyed() {
      if (room.script && room.script.video_unload) {
        room.script.video_unload()
      }
      clearInterval(this.ping_interval)
      clearTimeout(this.catchup_timeout)
      clearInterval(this.catchup_interval)
      player_state.player = null
    }
  },

  playlist: {
    start_drag(e) {
      const target = e.touches ? e.touches[0].target : e.target
      if (!(target.tagName == "BUTTON" && target.classList.contains("playlist_drag"))) {
        return
      }

      target.parentElement.classList.toggle("dragging", true)
      document.addEventListener("mouseup", e => this.stop_drag(e))
      document.addEventListener("mousemove", e => this.drag(e))
      document.addEventListener("touchend", e => this.stop_drag(e))
      document.addEventListener("touchmove", e => this.drag(e))
    },
    stop_drag(_) {
      const order = []
      for (const item of this.el.children) {
        order.push(parseInt(item.dataset.id))
        item.style.transform = "none"
        item.classList.toggle("dragging", false)
      }

      this.pushEvent("order", { order: order })

      document.removeEventListener("mouseup", e => this.stop_drag(e))
      document.removeEventListener("mousemove", e => this.drag(e))
      document.removeEventListener("touchend", e => this.stop_drag(e))
      document.removeEventListener("touchmove", e => this.drag(e))
    },
    drag(e) {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      for (let i = 0; i < this.el.children.length; i++) {
        const el = this.el.children[i]

        if (el.classList.contains("dragging")) {
          el.style.transform = "none"

          let rect = el.getBoundingClientRect()
          let mouse_y = Math.min(Math.max(clientY,
            this.el.firstElementChild.getBoundingClientRect().y),
            this.el.lastElementChild.getBoundingClientRect().bottom)
          let y = rect.y
          let off = mouse_y - y - rect.height / 2

          for (let j = i - 1; j <= i + 1; j++) { // only 1 before and after
            if (j < 0 || j == i || j >= this.el.children.length) continue
            const el2 = this.el.children[j]
            if ((j < i && mouse_y <= (el2.getBoundingClientRect().y + el2.getBoundingClientRect().height / 2)) ||
              (j > i && mouse_y >= (el2.getBoundingClientRect().y + el2.getBoundingClientRect().height / 2))) {
              if (j < i) {
                this.el.insertBefore(el, el2)
              } else {
                this.el.insertBefore(el2, el)
              }

              rect = el.getBoundingClientRect()
              y = rect.y
              off = mouse_y - y - rect.height / 2
              break
            }
          }

          el.style.transform = `translate(0, ${off}px)`
          break
        }
      }
    },
    yt_search(query) {
      this.pushEvent("yt_search", { query: query }, reply => {
        if (!reply.success) { return }
        while (playlist_yt_list.firstChild) playlist_yt_list.removeChild(playlist_yt_list.firstChild)

        for (const video of reply.items) {
          const video_url = `https://youtube.com/watch?v=${video.id}`

          const video_e = create_element(playlist_yt_list, "div", "yt-video")

          const video_e_thumbnail = create_element(video_e, "img")
          video_e_thumbnail.style.height = "6em"
          video_e_thumbnail.src = `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`

          let column = create_element(video_e, "div")

          const video_e_title = create_element(column, "a")
          video_e_title.innerHTML = video.title
          video_e_title.href = video_url

          const video_e_author = create_element(column, "a")
          video_e_author.textContent = video.channel_title
          video_e_author.href = `https://youtube.com/channel/${video.channel_id}`

          const video_add = create_element(video_e, "button")
          video_add.textContent = "Add"

          video_add.addEventListener("click", () => {
            this.pushEvent("add", {
              title: "",
              url: video_url,
              sub: "",
              alts: "{}"
            })
          })
        }
      })
    },
    yt_search_timeout: null,
    unload: null,
    mounted() {
      window.__playlist = this

      load_media_directories(this, (get_meta("media_directories") || "").split("\n"))

      playlist_add.addEventListener("click", () => {
        this.pushEvent("add", {
          title: playlist_add_title.value,
          url: playlist_add_url.value,
          sub: playlist_add_sub.value,
          alts: playlist_add_small.value
        })
        playlist_add_title.value = ""
        playlist_add_url.value = ""
        playlist_add_sub.value = ""
        playlist_add_small.value = ""
      })

      playlist_yt_input.addEventListener("keydown", e => {
        if (playlist_yt_input.value.length <= 0) { return }
        if (this.yt_search_timeout) { clearTimeout(this.yt_search_timeout) }

        if (e.key == "Enter") {
          this.yt_search(playlist_yt_input.value)
        } else {
          this.yt_search_timeout = setTimeout(() => {
            this.yt_search(playlist_yt_input.value)
          }, 1000)
        }
      })

      const playlist_modal = create_window("playlist", { title: null, modal: true, show: false })
      const tab1 = playlist_modal.create_tab("Hosted")
      const tab2 = playlist_modal.create_tab("YouTube")

      tab1.appendChild(playlist_tab1)
      tab2.appendChild(playlist_tab2)

      playlist_btn_show.addEventListener("click", () => playlist_modal.show())

      this.el.addEventListener("mousedown", e => this.start_drag(e))
      this.el.addEventListener("touchstart", e => this.start_drag(e))
    },
    destroyed() {
      window.__playlist = null
      delete document.windows["playlist"]
    }
  },

  room: {
    extra_emotes: null,
    on_keydown: null,
    toggle_chat() {
      view_chat.classList.toggle("hidden")
      if (view_chat.classList.contains("hidden")) {
        btn_open_chat.textContent = "Open chat"
      } else {
        btn_open_chat.textContent = "Close chat"
      }
    },
    load() {
      chat_state.autohide = true
      for (const msg of chat_messages.children) {
        autohide(msg, 5000)
      }

      chat_state.on_message = (msg) => {
        new Text(chat_danmaku, msg)
        return true
      }

      this.on_keydown = e => {
        const chat_open = !view_chat.classList.contains("hidden")
        if (e.target.tagName == "INPUT" && e.target != chat_input) return

        if (e.key == "Enter") {
          this.toggle_chat()
          if (chat_open) {
            player.focus()
          } else {
            chat_input.focus()
          }
        } else if (e.key == "\\" && !chat_open) {
          this.toggle_chat()
          chat_btn_emotes.click()
          chat_input.focus()
        } else if (e.key == "e" && !chat_open) {
          if (this.extra_emotes.is_open()) {
            this.extra_emotes.close()
          } else {
            this.extra_emotes.show()
          }
        } else if (e.key == "Escape") {
          if (!view_chat.classList.contains("hidden")) {
            e.preventDefault()
            chat_input.value = ""
            this.toggle_chat()
            chat_state.emotes_modal.close()
            player.focus()
          }
          if (this.extra_emotes.is_open()) {
            this.extra_emotes.close()
          }
        } else {
          return
        }

        e.preventDefault()
      }

      document.addEventListener("keydown", this.on_keydown)

      btn_open_chat.addEventListener("click", this.toggle_chat)

      this.extra_emotes = create_window("chat_emotes2", {
        title: null,
        root: this.el,
        show: false,
        close_on_unfocus: true,
        invert_x: true,
        invert_y: true,
        classes: "chat_emotes thin_scrollbar"
      })

      const chat_emotes = document.getElementById("chat_emotes")

      for (const emote of chat_emotes.children) {
        const new_emote = emote.cloneNode(true)
        this.extra_emotes.appendChild(new_emote)
        new_emote.addEventListener("click", _ => {
          chat_state.chat.send(`:${emote.title}:`)
          this.extra_emotes.close()
          player.focus()
        })
      }
    },
    unload: null,
    mounted() {
      init_settings()
      init_drag()

      if (player_state.player) {
        player_state.player.fullscreen_element = this.el
      } else {
        player_state.fullscreen_element = this.el
      }

      if (document.getElementById("chat_container")) {
        this.load()
      } else {
        chat_state.on_load = () => this.load()
      }

      room.room = this
      load_script()
    },
    destroyed() {
      if (room.script && room.script.room_unload) {
        room.script.room_unload()
      }
      chat_state.autohide = false
      chat_state.on_message = null
      destroy_drag()
      delete document.windows["Settings"]
      delete document.windows["chat_emotes2"]
      document.removeEventListener("keydown", this.on_keydown)
    }
  },

  create_poll: {
    mounted() {
      this.el.addEventListener("click", () => {
        this.create_poll_modal()
      })
    },
    create_choice(choices, choices_list) {
      const choice = {}

      choice.e = create_element(choices_list, "div")
      choice.name = create_element(choice.e, "input")
      choice.del = create_element(choice.e, "button", "square icon")
      choice.del.textContent = "clear"

      choice.del.addEventListener("click", () => {
        choices.forEach(c => {
          if (c.del == choice.del) {
            choices_list.removeChild(choice.e)
            choices.splice(choices.indexOf(c), 1)
          }
        })
      })

      choices.push(choice)
      return choice
    },
    create_poll_modal() {
      const modal = create_window(null, { title: "Create a poll", classes: "poll_modal" })

      const poll_title = create_element(modal, "input")
      poll_title.placeholder = "Title"

      const choices_list = create_element(modal, "div", "choices")

      const choices = []
      this.create_choice(choices, choices_list)

      const poll_add_choice = create_element(modal, "button")
      poll_add_choice.textContent = "Add another choice"

      poll_add_choice.addEventListener("click", () => {
        this.create_choice(choices, choices_list).name.focus()
      })

      const poll_create = create_element(modal, "button")
      poll_create.textContent = "Create"

      poll_create.addEventListener("click", () => {
        const final_title = poll_title.value.trim()
        if (final_title.length <= 0) { return }
        if (choices.length <= 0) { return }

        const final_choices = []
        choices.forEach(e => {
          const choice = e.name.value.trim()
          if (choice.length > 0) {
            final_choices.push(choice)
          }
        })

        if (final_choices.length <= 0) { return }

        this.pushEvent("add", { title: final_title, choices: final_choices })

        modal.close()
      })

      modal.show()
      poll_title.focus()
    }
  }
}

topbar.config({ barColors: { 0: "#29d" }, shadowColor: "rgba(0, 0, 0, .3)" })
let topBarScheduled = undefined
window.addEventListener("phx:page-loading-start", () => {
  if (!topBarScheduled) {
    topBarScheduled = setTimeout(() => topbar.show(), 120)
  }
})

window.addEventListener("phx:page-loading-stop", () => {
  clearTimeout(topBarScheduled)
  topBarScheduled = undefined
  topbar.hide()
})

const liveSocket = new LiveSocket("/live", Socket, {
  hooks: hooks,
  params: { _csrf_token: get_meta("csrf-token") }
})
liveSocket.connect()
window.liveSocket = liveSocket
