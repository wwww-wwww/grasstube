import {create_modal} from "./modals"
import {get_cookie, set_cookie} from "./cookies"
import {change_layout} from "./drag"

function init() {
	btn_user_settings.addEventListener("click", make_settings)

	document.getElementsByTagName("header")[0].classList.toggle("hidden", (get_cookie("room_hide_header") || 0))
}

function make_settings() {
	const modal = create_modal()
	const modal_body = modal.get_body()
	modal.label.textContent = "settings"
	
	let row = document.createElement("div")
	row.style.display = "block"
	row.style.marginBottom = "0.5em"
	modal_body.appendChild(row)

	let lbl = document.createElement("span")
	lbl.textContent = "height:"
	lbl.style.marginRight = "0.5em"
	row.appendChild(lbl)

	let btn = document.createElement("button")
	btn.textContent = "80%"
	btn.addEventListener("click", () => { set_height("80") })
	btn.style.marginRight = "0.5em"
	row.appendChild(btn)

	btn = document.createElement("button")
	btn.textContent = "100%"
	btn.addEventListener("click", () => { set_height("100") })
	row.appendChild(btn)

	row = document.createElement("div")
	row.style.display = "block"
	row.style.marginBottom = "0.5em"
	modal_body.appendChild(row)

	lbl = document.createElement("span")
	lbl.textContent = "player:"
	lbl.style.marginRight = "0.5em"
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

	select_layout.selectedIndex = get_cookie("view_layout") || 0

	select_layout.addEventListener("change", () => { set_layout( select_layout.selectedIndex) })

	row.appendChild(select_layout)
	
	row = document.createElement("div")
	row.style.display = "block"
	modal_body.appendChild(row)

	lbl = document.createElement("span")
	lbl.textContent = "header:"
	lbl.style.marginRight = "0.5em"
	row.appendChild(lbl)

	const toggle_header = document.createElement("button")
	toggle_header.textContent = (get_cookie("room_hide_header") || 0) ? "off" : "on"
	row.appendChild(toggle_header)

	toggle_header.addEventListener("click", () => {
		const header_hide = (get_cookie("room_hide_header") || 0)
		set_cookie("room_hide_header", !header_hide)
		toggle_header.textContent = !header_hide ? "off" : "on"
		document.getElementsByTagName("header")[0].classList.toggle("hidden", !header_hide)
	})

}

function set_layout(n) {
	set_cookie("view_layout", n)
	change_layout()
}

function set_height(size) {
	set_cookie("drag_height", size == "80" ? "80%" : "100%")
	maincontent.style.height = size == "80" ? "80%" : "100%"

	window.dispatchEvent(new Event("resize"))
}

export {make_settings}
export default init
