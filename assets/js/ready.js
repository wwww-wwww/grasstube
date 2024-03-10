import { create_window, get_window } from "./window"
import { create_element } from "./util"

const sound = new Audio("https://res.cloudinary.com/grass/video/upload/v1710065534/ready.ogg")
sound.preload = "auto"

function ready(data, chat) {
  if (data.sender != "sys") return true
  if (data.content != "ready") return true

  if (data.extra_data.command == "create") {
    const window_ready = create_window(data.extra_data.id, { can_close: false, classes: "window_ready", title: null })
    window_ready.members = {}

    const title = create_element(window_ready, "div", "title")
    title.textContent = "Match found!"

    const members_el = create_element(window_ready, "div", "members")


    const members = data.extra_data.members
    for (const id in members) {
      let username = id;
      const info = members[id]
      if (id[0] == "$") {
        username = "anon" + id.slice(1)
      }
      const geo = info.geo
      const member = create_element(members_el, "div")
      const member_title = create_element(member, "div", "member_title")
      const member_name = create_element(member_title, "span")
      member_name.textContent = username
      const member_geo = create_element(member_title, "span")
      member_geo.textContent = [...geo.toUpperCase()]
        .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
        .reduce((a, b) => `${a}${b}`)

      const member_ready = create_element(member, "div")
      member_ready.textContent = "✘"

      window_ready.members[id] = {
        ready: () => {
          member_ready.textContent = "✔"
        }
      }
    }

    const start_time = Date.now()

    const timer_pie = create_element(window_ready, "div", "timer_pie")

    window_ready.btn_ready = create_element(window_ready, "button")
    window_ready.btn_ready.textContent = "Accept"
    window_ready.btn_ready.addEventListener("click", () => {
      chat.send("/ready")
    })

    timer_pie.style.setProperty("--p", 1)

    const interval = setInterval(() => {
      const v = (10 - (Date.now() - start_time) / 1000) / 10
      timer_pie.style.setProperty("--p", v)
    }, 200)

    sound.currentTime = 0
    sound.play()

    window_ready.show()

    setTimeout(() => {
      window_ready.close()
      clearInterval(interval)
    }, 10000)
  }

  if (data.extra_data.command == "ready") {
    const window_ready = get_window(data.extra_data.id)
    if (window_ready == null) return false

    const user_id = data.extra_data.user_id
    if (!(user_id in window_ready.members)) return false

    if (user_id == chat.user_id) {
      console.log("disable btn")
      window_ready.btn_ready.disabled = true
    }

    window_ready.members[user_id].ready()
  }

  if (data.extra_data.command == "close") {
    const window_ready = get_window(data.extra_data.id)
    window_ready.close()
    sound.pause()
    sound.currentTime = 0
  }

  return false
}

export { ready }
