import { create_window } from "./window"
import { get_cookie, set_cookie } from "./cookies"

function init() {
  const settings_modal = make_settings()
  btn_user_settings.addEventListener("click", () => settings_modal.show())

  document.getElementsByTagName("header")[0].classList.toggle("hide", (get_cookie("room_hide_header") || 0))
}

function make_settings() {
  const modal = create_window("Settings", { title: "Settings", modal: true, show: false })
  const modal_body = modal.get_body()

  let row = document.createElement("div")
  row.style.display = "block"
  row.style.marginBottom = "0.5em"
  modal_body.appendChild(row)

  let lbl = document.createElement("span")
  lbl.textContent = "Height:"
  lbl.style.marginRight = "0.5em"
  row.appendChild(lbl)

  let slider = document.createElement("input")
  slider.type = "range"
  slider.min = 80
  slider.max = 100
  slider.style.marginRight = "0.5em"
  row.appendChild(slider)

  let slider_n = document.createElement("input")
  slider_n.type = "number"
  slider_n.style.width = "5em"
  row.appendChild(slider_n)

  const h = get_cookie("drag_height")
  if (h) {
    const r = h.match(/\d+/)
    if (r) {
      slider.value = r[0]
      slider_n.value = r[0]
    }
  }

  slider.addEventListener("input", () => {
    slider_n.value = slider.value
    set_height(`${slider.value}%`)
  })
  slider_n.addEventListener("input", () => {
    slider.value = slider_n.value
    set_height(`${slider_n.value}%`)
  })

  let btn = null

  if (document.getElementById("container_chat")) {
    row = document.createElement("div")
    row.style.display = "block"
    row.style.marginBottom = "0.5em"
    modal_body.appendChild(row)

    btn = document.createElement("button")
    btn.textContent = "Fit width (16:9)"
    btn.addEventListener("click", () => { fit_width() })
    row.appendChild(btn)
  }

  row = document.createElement("div")
  row.style.display = "block"
  modal_body.appendChild(row)

  lbl = document.createElement("span")
  lbl.textContent = "Header:"
  lbl.style.marginRight = "0.5em"
  row.appendChild(lbl)

  const toggle_header = document.createElement("button")
  toggle_header.textContent = (get_cookie("room_hide_header") || 0) ? "Off" : "On"
  row.appendChild(toggle_header)

  toggle_header.addEventListener("click", () => {
    const header_hide = (get_cookie("room_hide_header") || 0)
    set_cookie("room_hide_header", !header_hide)
    toggle_header.textContent = !header_hide ? "Off" : "On"
    document.getElementsByTagName("header")[0].classList.toggle("hide", !header_hide)
  })
  return modal
}

function set_height(size) {
  set_cookie("drag_height", size)
  maincontent.style.height = size

  window.dispatchEvent(new Event("resize"))
}

function fit_width() {
  const r_width = maincontent.getBoundingClientRect().height / 9 * 16 / window.innerWidth
  const w = (maincontent.style.flexDirection == "row-reverse") ? r_width : (1 - r_width)
  set_cookie("drag_width", w)
  console.log(w)
  container_chat.style.width = Math.round(w * window.innerWidth) + "px"
  window.dispatchEvent(new Event("resize"))
}

export { make_settings }
export default init
