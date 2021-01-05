import Modal from "./modals"
import { get_cookie, set_cookie } from "./cookies"
import { change_layout } from "./drag"

function init() {
  const settings_modal = make_settings()
  btn_user_settings.addEventListener("click", () => settings_modal.show())

  document.getElementsByTagName("header")[0].classList.toggle("hidden", (get_cookie("room_hide_header") || 0))
}

function make_settings() {
  const modal = new Modal({ title: "settings" })
  const modal_body = modal.get_body()

  let row = document.createElement("div")
  row.style.display = "block"
  row.style.marginBottom = "0.5em"
  modal_body.appendChild(row)

  let lbl = document.createElement("span")
  lbl.textContent = "height:"
  lbl.style.marginRight = "0.5em"
  row.appendChild(lbl)

  let slider = document.createElement("input")
  slider.type = "range"
  slider.min = 80
  slider.max = 100
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

  row = document.createElement("div")
  row.style.display = "block"
  row.style.marginBottom = "0.5em"
  modal_body.appendChild(row)

  let btn = document.createElement("button")
  btn.textContent = "fit width (16:9)"
  btn.addEventListener("click", () => { fit_width() })
  row.appendChild(btn)

  row = document.createElement("div")
  row.style.display = "block"
  row.style.marginBottom = "0.5em"
  modal_body.appendChild(row)

  lbl = document.createElement("span")
  lbl.textContent = "player:"
  lbl.style.marginRight = "0.5em"
  row.appendChild(lbl)

  const select_layout = document.createElement("select")
  let option = document.createElement("option")
  option.textContent = "right"
  option.value = 0
  select_layout.appendChild(option)
  option = document.createElement("option")
  option.textContent = "left"
  option.value = 1
  select_layout.appendChild(option)

  select_layout.selectedIndex = get_cookie("view_layout") || 0

  select_layout.addEventListener("change", () => { set_layout(select_layout.selectedIndex) })

  row.appendChild(select_layout)

  row = document.createElement("div")
  row.style.display = "block"
  modal_body.appendChild(row)

  lbl = document.createElement("span")
  lbl.textContent = "header:"
  lbl.style.marginRight = "0.5em"
  row.appendChild(lbl)

  const toggle_header = document.createElement("button")
  toggle_header.textContent = (get_cookie("room_hide_header") || 0) ? "off" : "on"
  row.appendChild(toggle_header)

  toggle_header.addEventListener("click", () => {
    const header_hide = (get_cookie("room_hide_header") || 0)
    set_cookie("room_hide_header", !header_hide)
    toggle_header.textContent = !header_hide ? "off" : "on"
    document.getElementsByTagName("header")[0].classList.toggle("hidden", !header_hide)
  })
  return modal
}

function set_layout(n) {
  set_cookie("view_layout", n)
  change_layout()
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
