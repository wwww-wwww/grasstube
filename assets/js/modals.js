function create_modal(root) {
    root = root || body

    const modal = document.createElement("div")
    modal.className = "modal"

    const modal_back = document.createElement("div")
    modal_back.className = "modal-back"
    modal_back.onclick = e => {
        root.removeChild(modal)
    }
    modal.appendChild(modal_back)

    modal.inner = document.createElement("div")
    modal.inner.className = "modal-inner"
    modal.appendChild(modal.inner)

    const modal_header = document.createElement("div")
    modal_header.className = "modal-header"
    modal.inner.appendChild(modal_header)
    
    const modal_close = document.createElement("button")
    modal_close.className = "modal-close square"
    modal_close.textContent = "×"
    modal_close.onclick = _ => {
        root.removeChild(modal)
    }
    modal_header.appendChild(modal_close)

    modal.label = document.createElement("span")
    modal.label.className = "modal-title"
    modal_header.appendChild(modal.label)

    root.appendChild(modal)

    modal.get_body = () => {
        if (modal.body == "undefined" || modal.body == null) {
            const body_outer = document.createElement("div")
            body_outer.style.overflow = "auto"
            modal.inner.appendChild(body_outer)
            modal.body = document.createElement("div")
            modal.body.className = "modal-content"
            body_outer.appendChild(modal.body)
        }
    
        return modal.body
    }

    return modal
}

export {create_modal}
