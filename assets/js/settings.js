import {create_modal, modal_set_title, modal_get_body} from "./modals"
import {get_cookie, set_cookie} from "./cookies"

let get_octopus_instance = void 0
let reload_vid = void 0

function init(octopus, reload) {
	get_octopus_instance = octopus
	reload_vid = reload

	const cookie = get_cookie()

	if (cookie.height) maincontent.style.height = cookie.height
	if (cookie.width) container_chat.style.width = cookie.width * window.innerWidth + "px"

	change_layout()

	btn_user_settings.addEventListener("click", make_settings)

	window.addEventListener("resize", e => {
		if (maincontent.style.flexDirection == "row-reverse")
			dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().left + 1}px, 0)`
		else
			dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().right - 2}px, 0)`
			
		dragbar_v.style.transform = `translate(0, ${maincontent.getBoundingClientRect().bottom - 2}px)`
	})
}

function make_settings() {
	const modal = create_modal()
	const modal_body = modal_get_body(modal)
	modal_set_title(modal, "settings")
	
	let row = document.createElement("div")
	row.style.display = "block"
	row.style.marginBottom = "4px"

	let lbl = document.createElement("span")
	lbl.textContent = "height:"
	lbl.style.marginRight = "4px"

	row.appendChild(lbl)

	let btn = document.createElement("button")
	btn.textContent = "80%"
	btn.addEventListener("click", () => { set_height("80") })
	btn.style.marginRight = "4px"
	row.appendChild(btn)

	btn = document.createElement("button")
	btn.textContent = "100%"
	btn.addEventListener("click", () => { set_height("100") })
	row.appendChild(btn)
	
	modal_body.appendChild(row)

	row = document.createElement("div")
	row.style.display = "block"
	row.style.marginBottom = "4px"

	lbl = document.createElement("span")
	lbl.textContent = "player:"
	lbl.style.marginRight = "4px"

	row.appendChild(lbl)

	const select_layout = document.createElement("select")
	let option = document.createElement("option")
	option.textContent = "right"
	option.value = 0
	select_layout.appendChild(option)
	option = document.createElement("option")
	option.textContent = "left"
	option.value = 1
	select_layout.appendChild(option)

	const cookie = get_cookie()
	
	select_layout.selectedIndex = cookie.viewmode || 0

	select_layout.addEventListener("change", () => { set_layout( select_layout.selectedIndex) })

	row.appendChild(select_layout)

	modal_body.appendChild(row)

	row = document.createElement("div")
	row.style.display = "block"
	row.style.marginBottom = "4px"

	lbl = document.createElement("span")
	lbl.textContent = "LQ:"
	lbl.style.marginRight = "4px"

	row.appendChild(lbl)

	const lq_toggle = document.createElement("input")
	lq_toggle.type = "checkbox"
	lq_toggle.style.verticalAlign = "middle"
	lq_toggle.checked = cookie.lq || false
	lq_toggle.addEventListener("change", () => {
		const cookie = get_cookie()
		cookie.lq = lq_toggle.checked
		set_cookie(cookie)
		reload_vid()
	})

	row.appendChild(lq_toggle)

	modal_body.appendChild(row)
}

function set_layout(n) {
	const cookie = get_cookie()
	cookie.viewmode = n
	set_cookie(cookie)
	change_layout()
}

function change_layout() {
	const cookie = get_cookie()

	const layout = cookie.viewmode

	if (layout == 0) {
		maincontent.style.flexDirection = "row"
	} else if (layout == 1) {
		maincontent.style.flexDirection = "row-reverse"
	}

	if (maincontent.style.flexDirection == "row-reverse")
		dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().left - 1}px, 0)`
	else
		dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().right - 2}px, 0)`
		
	dragbar_v.style.transform = `translate(0, ${maincontent.getBoundingClientRect().bottom - 2}px)`

	seekbar.style.left = container_video.getBoundingClientRect().left + "px"
	seekbar.style.width = container_video.getBoundingClientRect().width + "px"

	if (get_octopus_instance() != null) get_octopus_instance().resize()
}

function set_height(size) {
	const cookie = get_cookie()
	cookie.height = size == "80" ? "80%" : "100%"
	set_cookie(cookie)

	maincontent.style.height = cookie.height

	if (get_octopus_instance() != null) get_octopus_instance().resize()
}

export {make_settings}
export default init
