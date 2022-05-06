function pad(n, width, z) {
  z = z || "0"
  n = n + ""
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n
}

function enter(event, cb) {
  if (event.key == "Enter") {
    event.preventDefault()
    cb()
  }
}

function create_element(root, type, classes = "") {
  const e = document.createElement(type)

  if (classes.length > 0) {
    for (const class_name of classes.split(" ")) {
      e.classList.toggle(class_name, true)
    }
  }

  if (root) root.appendChild(e)
  return e
}

function seconds_to_hms(seconds, hide_hours = false) {
  seconds = Math.round(seconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  seconds = seconds % 60
  if (hide_hours && hours <= 0)
    return `${pad(minutes, 2)}:${pad(seconds, 2)}`
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`
}

// https://stackoverflow.com/a/16149053
function unescape_html(unsafe) {
  return unsafe
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#0{0,1}39;/g, "'")
}

function get_meta(meta_name) {
  return document.querySelector(`meta[name='${meta_name}']`).getAttribute("content")
}

export { pad, enter, seconds_to_hms, unescape_html, get_meta, create_element }
