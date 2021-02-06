import { get_cookie, set_cookie } from "./cookies"

let dragging_h = false
let dragging_v = false

let r_width = undefined
let r_height = undefined

function init() {
  if (document.getElementById("dragbar_h")) {
    if (document.getElementById("container_chat")) {
      const drag_width = get_cookie("drag_width")
      if (drag_width) container_chat.style.width = Math.round(drag_width * window.innerWidth) + "px"
    }
    dragbar_h.addEventListener("mousedown", e => {
      e.preventDefault()
      dragging_h = true
      document.addEventListener("mousemove", drag_h)
      dragbar_h.style.opacity = 1
    })
    change_layout()
  }

  if (document.getElementById("dragbar_v")) {
    const drag_height = get_cookie("drag_height")
    if (drag_height) maincontent.style.height = drag_height

    dragbar_v.addEventListener("mousedown", e => {
      e.preventDefault()
      dragging_v = true
      document.addEventListener("mousemove", drag_v)
      dragbar_v.style.opacity = 1
    })
  }

  hide_scrollbar()

  document.addEventListener("mouseup", e => {
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
      document.removeEventListener("mousemove", drag_h)
      document.removeEventListener("mousemove", drag_v)

      dragging_h = false
      dragging_v = false

      if (document.getElementById("dragbar_h")) {
        dragbar_h.style.opacity = 0
      }

      if (document.getElementById("dragbar_v")) {
        dragbar_v.style.opacity = 0
      }

      window.dispatchEvent(new Event("resize"))
    }
  })

  window.dispatchEvent(new Event("resize"))
}

function hide_scrollbar() {
  window.addEventListener("resize", e => {
    const scrollbar = container2.offsetWidth - container2.clientWidth
    container2.style.paddingRight = scrollbar + "px"
    container2.style.width = "calc(100% + " + scrollbar + "px)"
    maincontent.style.width = "calc(100% + " + scrollbar + "px)"
    bottom.style.width = "calc(100% + " + scrollbar + "px)"

    if (document.getElementById("dragbar_h") && document.getElementById("container_chat")) {
      if (maincontent.style.flexDirection == "row-reverse") {
        dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().left + 1}px, 0)`
      } else {
        dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().right - 2}px, 0)`
      }
    }

    if (document.getElementById("dragbar_v")) {
      dragbar_v.style.transform = `translate(0, ${maincontent.getBoundingClientRect().bottom - maincontent.getBoundingClientRect().top - 2}px)`
    }
  })

  window.dispatchEvent(new Event("resize"))
}

function change_layout() {
  const layout = get_cookie("view_layout")
  if (layout == 0) {
    maincontent.style.flexDirection = "row"
  } else if (layout == 1) {
    maincontent.style.flexDirection = "row-reverse"
  }
}

function drag_h(e) {
  let left = e.pageX / window.innerWidth

  r_width = (maincontent.style.flexDirection == "row-reverse") ? left : left + 1 / window.innerWidth

  dragbar_h.style.transform = `translate(${left * window.innerWidth - 1}px, 0)`
}

function drag_v(e) {
  const top = e.pageY - maincontent.getBoundingClientRect().top

  r_height = top

  dragbar_v.style.transform = `translate(0, ${top - 1}px)`
}

export default init
export { change_layout, hide_scrollbar }
