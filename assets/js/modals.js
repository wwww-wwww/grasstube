function create_modal(root) {

	root = root || body

	const modal = document.createElement("div")
	modal.className = "modal"

	const modal_back = document.createElement("div")
	modal_back.className = "modal-back"
	modal_back.onclick = e => {
		root.removeChild(modal)
	}

	const modal_inner = document.createElement("div")
	modal_inner.className = "modal-inner"

	const modal_close = document.createElement("span")
	modal_close.className = "modal-close"
	modal_close.textContent = "×"
	modal_close.onclick = e => {
		root.removeChild(modal)
	}

	const modal_title = document.createElement("span")
	modal_title.className = "modal-title"

	modal.appendChild(modal_back)
	modal_inner.appendChild(modal_close)
	modal_inner.appendChild(modal_title)
	modal.appendChild(modal_inner)

	root.appendChild(modal)

	return modal
}

function modal_set_title(modal, title) {
	modal.children[1].children[1].textContent = title
}

function modal_get_body(modal) {
	if (modal.children[1].children[2] == "undefined" || modal.children[0].children[2] == null) {
		const modal_content = document.createElement("div")
		modal_content.className = "modal-content"
		modal.children[1].appendChild(modal_content)
	}

	return modal.children[1].children[2]
}

export {create_modal, modal_set_title, modal_get_body}
