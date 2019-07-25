function get_cookie() {
	let decoded = ""
	try {
		decoded = document.cookie
	} catch(e) {
		console.log(e)
	}
	let ca = decoded.split(";");
	for (let i in ca) {
		const cookie = ca[i].trim()
		if (cookie.indexOf("data=") == 0)
			try {
				return JSON.parse(cookie.substring(5))
			} catch (e) {}
	}
	return {}
}

function set_cookie(cookie) {
	document.cookie = "data=" + JSON.stringify(cookie)
}

export {get_cookie, set_cookie}
