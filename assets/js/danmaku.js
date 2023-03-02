import { create_element } from "./util"

class Text {
  constructor(root, data) {
    this.e = create_element(root, "div", "bullet")
    this.e.innerHTML = data.content
    this.e.style.top = `${Math.random() * 90}%`
    setTimeout(() => root.removeChild(this.e), 5000)

    if (data.content.toLowerCase() != data.content &&
      data.content.toUpperCase() == data.content) {
      this.e.classList.toggle("shake", true)
    }
  }
}

export default Text
