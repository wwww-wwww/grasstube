import { create_window } from "./window"
import { get_cookie, set_cookie } from "./cookies"
import { create_element } from "./util"

function init() {
  const settings_modal = make_settings()
  btn_user_settings.addEventListener("click", () => settings_modal.show())

  document.getElementsByTagName("header")[0].classList.toggle("hide", (get_cookie("room_hide_header") || 0))
}

function make_settings() {
  const modal = create_window("Settings", { title: "Settings", modal: true, show: false })

  let row = create_element(modal, "div", "row")

  let lbl = create_element(row, "span")
  lbl.textContent = "Height:"

  let slider = create_element(row, "input")
  slider.type = "range"
  slider.min = 80
  slider.max = 100

  let slider_n = create_element(row, "input")
  slider_n.type = "number"
  slider_n.style.width = "5em"

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

  row = create_element(modal, "div", "row")

  lbl = create_element(row, "span")
  lbl.textContent = "Header:"

  const toggle_header = create_element(row, "button")
  toggle_header.textContent = (get_cookie("room_hide_header") || 0) ? "Off" : "On"

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

export { make_settings }
export default init
