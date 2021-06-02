function get_cookies() {
  let decoded = ""
  try {
    decoded = document.cookie
  } catch (e) {
    console.log(e)
  }
  const ca = decoded.split(";")
  for (const i in ca) {
    const cookie = ca[i].trim()
    if (cookie.indexOf("data=") == 0)
      try {
        return JSON.parse(cookie.substring(5))
      } catch (e) { }
  }
  return {}
}

function get_cookie(cookie_name, def = null) {
  const cookie = get_cookies()
  if (cookie_name in cookie) return cookie[cookie_name]
  else return def
}

function set_cookie(cookie_name, value) {
  const cookie = get_cookies()
  cookie[cookie_name] = value

  const d = new Date()
  d.setTime(d.getTime() + (3600 * 24 * 365 * 1000))

  document.cookie = `data=${JSON.stringify(cookie)};path=/;expires=${d.toUTCString()}`
}

export { get_cookie, set_cookie }
