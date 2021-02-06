import { create_element } from "./util"

class Text {
  constructor(root, msg) {
    this.e = create_element(root, "div", "bullet")
    this.e.innerHTML = msg.data.content
    this.e.style.top = `${Math.random() * 90}%`
    setTimeout(() => {
      root.removeChild(this.e)
    }, 5000)

    if (msg.data.content.toLowerCase() != msg.data.content &&
      msg.data.content.toUpperCase() == msg.data.content) {
      this.e.classList.toggle("shake", true)
    }
  }
}

export default Text
