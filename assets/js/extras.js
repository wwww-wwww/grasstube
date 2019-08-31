function pad(n, width, z) {
	z = z || '0'
	n = n + ''
	return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n
}

function enter(event, cb) {
	event.preventDefault();
	if (event.keyCode !== 13) return;
	cb()
}

function seconds_to_hms(seconds, hide_hours = false) {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor(seconds / 60) % 60
	seconds = Math.ceil(seconds % 60)
	if (hide_hours && hours <= 0) 
		return `${pad(minutes, 2)}:${pad(seconds, 2)}`
	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`
}

export {pad, enter, seconds_to_hms}
