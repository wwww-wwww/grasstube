import {get_cookie, set_cookie} from "./cookies"

let dragging_h = false
let dragging_v = false

let r_width = undefined
let r_height = undefined

function init() {
    const drag_height = get_cookie("drag_height")
    if (drag_height) maincontent.style.height = drag_height

    const drag_width = get_cookie("drag_width")
    if (drag_width) container_chat.style.width = Math.round(drag_width * window.innerWidth) + "px"

    change_layout()

    window.addEventListener("resize", e => {
        const scrollbar = container2.offsetWidth - container2.clientWidth
        container2.style.paddingRight = scrollbar + "px"
        container2.style.width = "calc(100% + " + scrollbar + "px)"
        maincontent.style.width = "calc(100% + " + scrollbar + "px)"
        bottom.style.width = "calc(100% + " + scrollbar + "px)"

        if (maincontent.style.flexDirection == "row-reverse")
            dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().left + 1}px, 0)`
        else
            dragbar_h.style.transform = `translate(${container_chat.getBoundingClientRect().right - 2}px, 0)`
            
        dragbar_v.style.transform = `translate(0, ${maincontent.getBoundingClientRect().bottom - maincontent.getBoundingClientRect().top - 2}px)`
    })
    
    window.dispatchEvent(new Event("resize"))

    dragbar_h.addEventListener("mousedown", e => {
        e.preventDefault()
        dragging_h = true
        document.addEventListener("mousemove", drag_h)
        dragbar_h.style.opacity = 1
    })

    dragbar_v.addEventListener("mousedown", e => {
        e.preventDefault()
        dragging_v = true
        document.addEventListener("mousemove", drag_v)
        dragbar_v.style.opacity = 1
    })

    document.addEventListener("mouseup", e => {
        if (dragging_v){
            set_cookie("drag_height", r_height + "px")
            maincontent.style.height = r_height + "px"
        }

        if (dragging_h) {
            const w = (maincontent.style.flexDirection == "row-reverse") ? (1 - r_width) : r_width
            set_cookie("drag_width", w)
            container_chat.style.width = Math.round(w * window.innerWidth) + "px"
        }

        document.removeEventListener("mousemove", drag_h)
        document.removeEventListener("mousemove", drag_v)
        
        dragging_h = false
        dragging_v = false
        dragbar_h.style.opacity = 0
        dragbar_v.style.opacity = 0

        window.dispatchEvent(new Event("resize"))
    })
}

function change_layout() {
    const layout = get_cookie("view_layout")
    if (layout == 0) {
        maincontent.style.flexDirection = "row"
    } else if (layout == 1) {
        maincontent.style.flexDirection = "row-reverse"
    }

    window.dispatchEvent(new Event("resize"))
}

function drag_h(e) {
    let left = e.pageX / window.innerWidth

    r_width = (maincontent.style.flexDirection == "row-reverse") ? left : left + 1 / window.innerWidth
    
    dragbar_h.style.transform = `translate(${left * window.innerWidth - 1}px, 0)`
}

function drag_v(e) {
    const top = e.pageY - maincontent.getBoundingClientRect().top 

    r_height = top

    dragbar_v.style.transform = `translate(0, ${top - 1}px)`
}

export default init
export {change_layout}
