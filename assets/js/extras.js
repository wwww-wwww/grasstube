function pad(n, width, z) {
    z = z || '0'
    n = n + ''
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n
}

function enter(event, cb) {
    event.preventDefault()
    if (event.keyCode !== 13) return
    cb()
}

function seconds_to_hms(seconds, hide_hours = false) {
    seconds = Math.ceil(seconds)
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

export {pad, enter, seconds_to_hms, unescape_html}
