import {get_cookie, set_cookie} from "./cookies"

let dragging_h = false
let dragging_v = false

let get_octopus_instance = void 0

let r_width = undefined
let r_height = undefined

function init(octopus) {
	get_octopus_instance = octopus
	dragbar_h.addEventListener("mousedown", e => {
		e.preventDefault()
		dragging_h = true
		document.addEventListener("mousemove", drag_h)
		dragbar_h.style.opacity = 1;
	})

	dragbar_v.addEventListener("mousedown", e => {
		e.preventDefault()
		dragging_v = true
		document.addEventListener("mousemove", drag_v)
		dragbar_v.style.opacity = 1;
	})

	document.addEventListener("mouseup", e => {
		const cookie = get_cookie()

		if (dragging_v){
			cookie.height = r_height + "px"
			maincontent.style.height = r_height + "px"
		}

		if (dragging_h) {
			if (maincontent.style.flexDirection == "row-reverse")
				cookie.width = (1 - r_width)
			else
				cookie.width = r_width
			
			container_chat.style.width = cookie.width * window.innerWidth + "px"
		}

		set_cookie(cookie)

		document.removeEventListener("mousemove", drag_h)
		document.removeEventListener("mousemove", drag_v)
		
		dragging_h = false
		dragging_v = false
		dragbar_h.style.opacity = 0;
		dragbar_v.style.opacity = 0;
		
		seekbar.style.left = container_video.getBoundingClientRect().left + "px"
		seekbar.style.width = container_video.getBoundingClientRect().width + "px"

		if (get_octopus_instance() != null) get_octopus_instance().resize()
	})
}

function drag_h(e) {
	let left = e.pageX / window.innerWidth

	if (maincontent.style.flexDirection == "row-reverse") {
		r_width = left
		dragbar_h.style.transform = `translate(${left * window.innerWidth - 1}px, 0)`
	} else {
		r_width = left + 1 / window.innerWidth
		dragbar_h.style.transform = `translate(${left * window.innerWidth - 1}px, 0)`
	}
}

function drag_v(e) {
	const top = e.pageY - maincontent.getBoundingClientRect().top + 1

	r_height = top

	dragbar_v.style.transform = `translate(0, ${top + 1}px)`
}

export default init