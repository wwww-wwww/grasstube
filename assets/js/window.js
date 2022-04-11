import { create_element } from "./util"

class Window {
  constructor({ root = null, can_close = true, title = null, show = true, modal = false, close_on_unfocus = false, invert_x = false, invert_y = false, classes = null } = {}) {
    this.root = root || document.querySelector("body")
    this.tabs = []
    this.selected_tab = null
    this.is_modal = modal
    this.moved = false
    this.invert_x = invert_x
    this.invert_y = invert_y

    this.drag = null

    this.on_close = null

    this.outer = create_element(null, "div", "modal-outer")

    if (modal) {
      this.e = create_element(this.outer, "div", "modal")
      this.back = create_element(this.outer, "div", "modal-back")
    } else if (close_on_unfocus) {
      this.e = create_element(this.outer, "div", "window")
      this.back = create_element(this.outer, "div", "modal-back")
      this.back.style.background = "none"
    } else {
      this.e = create_element(this.outer, "div", "window")
      this.outer.style.pointerEvents = "none"
      this.e.style.pointerEvents = "all"
    }

    if (classes != null) {
      classes.split(" ").forEach(c => this.e.classList.toggle(c, true))
    }

    this.top = create_element(this.e, "div", "window-top")

    if (!modal) {
      this.on_drag_move = e => this.drag_move(e)
      this.on_drag_end = e => this.drag_end(e)
      this.top.addEventListener("mousedown", e => this.drag_start(e))
      window.addEventListener("resize", () => {
        if (!this.moved) return
        let new_x = this.e.offsetLeft
        let new_y = this.e.offsetTop

        if ((this.invert_x || this.invert_y)) {
          const rect = this.e.getBoundingClientRect()
          let width = 0
          let height = 0

          if (this.outer || this.root) {
            const outer_rect = (this.outer || this.root).getBoundingClientRect()
            width = outer_rect.width
            height = outer_rect.height
          } else {
            width = window.innerWidth
            height = window.innerHeight
          }

          if (this.invert_x) {
            new_x = width - new_x - rect.width
          }
          if (this.invert_y) {
            new_y = height - new_y - rect.height
          }
        }

        this.move_to(new_x, new_y)
      })
    }

    this.header = create_element(this.top, "div", "window-header")

    if (can_close) {
      if (modal || close_on_unfocus) {
        this.back.addEventListener("click", _ => this.close())
      }

      this.btn_close = create_element(this.top, "button", "window-close square material-icons")
      this.btn_close.textContent = "close"
      this.btn_close.addEventListener("click", _ => this.close())
    }

    if (title) this.add_title(title)
    if (show) this.show()
  }

  is_open() {
    return (this.outer || this.e).parentElement != null
  }

  show() {
    this.root.appendChild(this.outer || this.e)
  }

  drag_start(e) {
    if (e.target == this.btn_close) return
    e.preventDefault()

    this.top.style.cursor = "grabbing"

    const rect = this.e.getBoundingClientRect()
    this.drag = [
      e.clientX - rect.left,
      e.clientY - rect.top
    ]

    document.addEventListener("mousemove", this.on_drag_move)
    document.addEventListener("mouseup", this.on_drag_end)
  }

  drag_end(e) {
    if (this.drag == null) return

    this.drag_move(e)
    this.top.style.cursor = ""
    this.drag = null

    document.removeEventListener("mousemove", this.on_drag_move)
    document.removeEventListener("mouseup", this.on_drag_end)
  }

  move_to(x, y) {
    if (this.is_modal) return
    if (!this.moved) return

    const rect = this.e.getBoundingClientRect()

    let width = 0
    let height = 0

    if (this.outer || this.root) {
      const outer_rect = (this.outer || this.root).getBoundingClientRect()
      width = outer_rect.width
      height = outer_rect.height
    } else {
      width = window.innerWidth
      height = window.innerHeight
    }

    const max_x = Math.floor(width - rect.width)
    const max_y = Math.floor(height - rect.height)
    const new_x = Math.min(Math.max(x, 0), max_x)
    const new_y = Math.min(Math.max(y, 0), max_y)

    if (this.invert_x) {
      this.e.style.right = `${new_x}px`
    } else {
      this.e.style.left = `${new_x}px`
    }
    if (this.invert_y) {
      this.e.style.bottom = `${new_y}px`
    } else {
      this.e.style.top = `${new_y}px`
    }

    this.e.style.transform = ""
  }

  drag_move(e) {
    if (this.drag == null) return
    this.moved = true

    const rect = this.e.getBoundingClientRect()

    const off_x = e.clientX - rect.left - this.drag[0]
    const off_y = e.clientY - rect.top - this.drag[1]

    let new_x = this.e.offsetLeft + off_x
    let new_y = this.e.offsetTop + off_y

    if ((this.invert_x || this.invert_y)) {
      let width = 0
      let height = 0

      if (this.outer || this.root) {
        const outer_rect = (this.outer || this.root).getBoundingClientRect()
        width = outer_rect.width
        height = outer_rect.height
      } else {
        width = window.innerWidth
        height = window.innerHeight
      }

      if (this.invert_x) {
        new_x = width - new_x - rect.width
      }
      if (this.invert_y) {
        new_y = height - new_y - rect.height
      }
    }

    this.move_to(new_x, new_y)
  }

  add_title(title) {
    const label = create_element(this.header, "span", "window-title")
    label.textContent = title
  }

  create_tab(title) {
    const tab = create_element(null, "div")
    tab.style.overflow = "hidden"

    tab.button = create_element(this.header, "button", "window-tab-button")
    tab.button.textContent = title
    tab.button.addEventListener("click", () => {
      if (tab != this.selected_tab) {
        this.selected_tab.style.display = "none"
        this.selected_tab.button.classList.toggle("window-tab-selected", false)
        tab.style.display = "unset"
        tab.button.classList.toggle("window-tab-selected", true)
        this.selected_tab = tab
      }
    })

    this.tabs.push(tab)
    this.appendChild(tab)

    if (!this.selected_tab) {
      this.selected_tab = tab
      tab.style.display = "unset"
      tab.button.classList.toggle("window-tab-selected", true)
    } else {
      tab.style.display = "none"
    }

    return tab
  }

  get_body() {
    if (this.e.body == "undefined" || this.e.body == null) {
      this.e.body_outer = create_element(this.e, "div")
      this.e.body_outer.style.overflow = "auto"
      this.e.body_outer.style.display = "flex"
      if (this.header.children.length > 0) {
        this.e.body_outer.style.borderTop = "1px solid rgba(255, 255, 255, 0.4)"
      }
      this.e.body = create_element(this.e.body_outer, "div", "window-content")
    }

    return this.e.body
  }

  appendChild(child) {
    this.get_body().appendChild(child)
  }

  close() {
    const e = (this.outer || this.e)
    if (e.parentElement != null) e.parentElement.removeChild(e)
    if (this.on_close) this.on_close()
  }
}

class Modal extends Window {
  constructor(opts) {
    opts.modal = true
    super(opts)
  }
}

function create_window(title, opts) {
  if (title == null) { return new Window(opts) }
  if (document.windows == undefined) {
    document.windows = {}
  }

  if (document.windows[title]) { return document.windows[title] }

  if (opts.title === undefined) opts.title = title
  document.windows[title] = new Window(opts)
  return document.windows[title]
}

export default Window
export { Modal, create_window }
