function get_cookies() {
	let decoded = ""
	try {
		decoded = document.cookie
	} catch(e) {
		console.log(e)
	}
	const ca = decoded.split(";");
	for (const i in ca) {
		const cookie = ca[i].trim()
		if (cookie.indexOf("data=") == 0)
			try {
				return JSON.parse(cookie.substring(5))
			} catch (e) {}
	}
	return {}
}

function get_cookie(cookie_name) {
	const cookie = get_cookies()
	if (cookie_name in cookie) return cookie[cookie_name]
	else return null
}

function set_cookie(cookie_name, value) {
	const cookie = get_cookies()
	cookie[cookie_name] = value
	document.cookie = "data=" + JSON.stringify(cookie) + ";path=/"
}

export {get_cookie, set_cookie}
