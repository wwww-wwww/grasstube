import { create_window, get_window } from "./window"
import { create_element } from "./util"

const sound = new Audio("/static/ready.ogg")
sound.preload = "auto"

function geo(cc) {
  return [...cc.toUpperCase()]
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .reduce((a, b) => `${a}${b}`)
}

function ready(data, chat) {
  if (data.sender != "sys") return true
  if (data.content != "ready") return true

  if (data.extra_data.command == "create") {
    const window_ready = create_window(data.extra_data.id, { root: maincontent, can_close: false, classes: "window_ready", title: null })
    window_ready.members = new Map()
    const members_el = []

    const title_bg = create_element(window_ready, "div", "title")
    window_ready.title = create_element(title_bg, "span", "title")
    window_ready.title.textContent = "Match found!"

    const timer_pie = create_element(window_ready, "div", "timer_pie")

    window_ready.members_el = create_element(window_ready, "div", "members")
    window_ready.members_el.style.display = "none"

    const members = data.extra_data.members
    for (const id in members) {
      const info = members[id]
      if (id[0] == "$") {
        info.username = "anon" + id.slice(1)
      } else {
        info.username = id
      }

      const member = create_element(window_ready.members_el, "img")
      member.src = "https://r2tube.grass.moe/ready/unready.png"

      members_el.push(member)
      window_ready.members.set(id, {
        is_ready: false,
        info: info,
        ready: () => {
          window_ready.members.get(id).is_ready = true
          member.src = "https://r2tube.grass.moe/ready/ready.png"
          members_el.sort((a, _) => a.src.includes("unready"))
          members_el.forEach(a => window_ready.members_el.appendChild(a))
        }
      })
    }

    const start_time = Date.now()

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

    window_ready.timeout = setTimeout(() => {
      window_ready.close()
      clearInterval(interval)

      const members = [...window_ready.members.values()]
        .filter(a => !a.is_ready)
        .map(a => `${a.info.username} ${geo(a.info.geo)}`)
        .join(", ")

      const notify = create_element(maincontent, "div", "notification")
      notify.textContent = `${members} has declined the ready check.`

      setTimeout(() => {
        notify.parentElement.removeChild(notify)
      }, 3000)
    }, 10000)
  }

  if (data.extra_data.command == "ready") {
    const window_ready = get_window(data.extra_data.id)
    if (window_ready == null) return false

    const user_id = data.extra_data.user_id
    if (!window_ready.members.has(user_id)) return false

    if (user_id == chat.user_id) {
      window_ready.btn_ready.style.display = "none"

      window_ready.members_el.style.display = ""
      window_ready.title.textContent = "Waiting for other players..."
    }

    window_ready.members.get(user_id).ready()
  }

  if (data.extra_data.command == "close") {
    const window_ready = get_window(data.extra_data.id)
    window_ready.close()
    clearTimeout(window_ready.timeout)
    sound.pause()
    sound.currentTime = 0
  }

  return false
}

export { ready }
