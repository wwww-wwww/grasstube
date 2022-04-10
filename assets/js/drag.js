import { get_cookie, set_cookie } from "./cookies"

let dragging_h = false
let dragging_v = false

let r_width = undefined
let r_height = undefined

function mouseup() {
  if (dragging_v) {
    set_cookie("drag_height", r_height + "px")
    maincontent.style.height = r_height + "px"
  }

  if (document.getElementById("container_chat") && dragging_h) {
    const w = (maincontent.style.flexDirection == "row-reverse") ? (1 - r_width) : r_width
    set_cookie("drag_width", w)
    container_chat.style.width = Math.round(w * window.innerWidth) + "px"
  }

  if (dragging_h || dragging_v) {
    document.removeEventListener("mousemove", drag_v)

    dragging_v = false

    if (document.getElementById("dragbar_v")) {
      dragbar_v.classList.toggle("active", false)
    }

    window.dispatchEvent(new Event("resize"))
  }
}

function hide_scrollbar() {
  const top = (window.container2 || main)
  const scrollbar = top.offsetWidth - top.clientWidth
  top.style.paddingRight = scrollbar + "px"
  top.style.width = `calc(100% + ${scrollbar}px)`
  maincontent.style.width = `calc(100% + ${scrollbar}px)`
  bottom.style.width = `calc(100% + ${scrollbar}px)`

  if (document.getElementById("dragbar_v")) {
    dragbar_v.style.top = `${maincontent.getBoundingClientRect().bottom - maincontent.getBoundingClientRect().top - 2}px`
  }
}

function init_drag() {
  if (document.getElementById("dragbar_v")) {
    const drag_height = get_cookie("drag_height")
    if (drag_height) maincontent.style.height = drag_height

    dragbar_v.addEventListener("mousedown", e => {
      e.preventDefault()
      dragging_v = true
      document.addEventListener("mousemove", drag_v)
      dragbar_v.classList.toggle("active", true)
    })
  }

  window.addEventListener("resize", hide_scrollbar)
  document.addEventListener("mouseup", mouseup)

  window.dispatchEvent(new Event("resize"))
}

function destroy_drag() {
  window.removeEventListener("resize", hide_scrollbar)
  document.removeEventListener("mouseup", mouseup)
}

function drag_v(e) {
  const top = e.pageY - maincontent.getBoundingClientRect().top

  r_height = top

  dragbar_v.style.top = `${top - 1}px`
}

export default init_drag
export { hide_scrollbar, init_drag, destroy_drag }
