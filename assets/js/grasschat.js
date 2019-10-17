import "phoenix_html"

import {Presence} from "phoenix"

import {create_modal} from "./modals"
import {pad, enter} from "./extras"
import {get_cookie, set_cookie} from "./cookies"

let channel = null

let users = []
let last_chat_user = ""

let freezeframe_loaded = false
const gifs = []

function init(socket) {
    console.log("freezeframe: fetching")

    const freezeframe_script = document.createElement("script")
    freezeframe_script.src = "https://unpkg.com/freezeframe/dist/freezeframe.min.js"
    freezeframe_script.addEventListener("load", () => {
        console.log("freezeframe: loaded")
        freezeframe_loaded = true

        for (const e of document.getElementsByClassName("message_content"))
            freeze_gifs(e)
    })

    document.head.appendChild(freezeframe_script)

    console.log("chat: connecting to room " + socket.room)
    channel = socket.channel("chat:" + socket.room, {})

    let presence = new Presence(channel)

    presence.onSync(() => repaint_userlist(presence))
    /*
    presence.onJoin((_id, current, _pres) => {
        if(!current){
            repaint_userlist(presence)
        }
    })

    presence.onLeave((_id, current, _pres) => {
        if(current.metas.length === 0){
            repaint_userlist(presence)
        }
    })*/

    channel.join()
    .receive("ok", resp => {
        const nickname = get_cookie("nickname")
        if (nickname || false) set_name(nickname)
        console.log("chat: connected", resp)
    })
    .receive("error", resp => {
        console.log("chat: failed to connect", resp)
    })

    channel.on("chat", data => on_chat(socket, data))

    channel.on("history", on_history)

    chat_input.addEventListener("keyup", event => { enter(event, () => { chat_send_msg() }) })
    btn_userlist_toggle.addEventListener("click", e => {
        userlist.classList.toggle("hidden")
    })

    btn_chat_settings.addEventListener("click", make_settings)

    window.addEventListener("focus", () => {
        messages.classList.toggle("freeze", false)
        unread_messages = 0
        document.title = unread_messages > 0 ? `${unread_messages} • ${socket.room}` : socket.room
    })

    window.addEventListener("blur", () => {
        if ((get_cookie("freezeframe") || 0))
            messages.classList.toggle("freeze", true)
    })

    messages.classList.toggle("freeze", !document.hasFocus() && (get_cookie("freezeframe") || 0))
}

function make_settings() {
    const modal = create_modal(chat_div)
    modal.label.textContent = "chat settings"
    const modal_body = modal.get_body()
    
    let row = document.createElement("div")
    row.style.display = "block"
    row.style.marginBottom = "0.5em"
    modal_body.appendChild(row)

    let lbl = document.createElement("span")
    lbl.textContent = "freeze gifs:"
    lbl.style.marginRight = "0.5em"
    row.appendChild(lbl)

    const toggle_freezeframe = document.createElement("button")
    toggle_freezeframe.textContent = (get_cookie("freezeframe") || 0) ? "on" : "off"
    row.appendChild(toggle_freezeframe)

    toggle_freezeframe.addEventListener("click", () => {
        const freezeframe = (get_cookie("freezeframe") || 0)
        set_cookie("freezeframe", !freezeframe)
        toggle_freezeframe.textContent = !freezeframe ? "on" : "off"
    })

    row = document.createElement("div")
    row.style.display = "block"
    modal_body.appendChild(row)

    lbl = document.createElement("span")
    lbl.textContent = "nickname:"
    lbl.style.marginRight = "0.5em"
    row.appendChild(lbl)

    const change_nickname = document.createElement("button")
    change_nickname.textContent = "change"
    row.appendChild(change_nickname)
    change_nickname.addEventListener("click", make_change_nickname)
}

function make_change_nickname() {
    const modal = create_modal(chat_div)
    modal.label.textContent = "change your nickname"

    const modal_body = modal.get_body()
    modal_body.style.textAlign = "right"

    const textfield = document.createElement("input")
    modal_body.appendChild(textfield)

    textfield.style.display = "block"
    textfield.style.width = "100%"
    textfield.value = get_cookie("nickname") || "anon"

    const btn_set = document.createElement("button")
    modal_body.appendChild(btn_set)

    btn_set.textContent = "set"
    btn_set.style.marginTop = "0.5em"

    btn_set.addEventListener("click", () => {
        if (set_name(textfield.value.trim())) {
            chat_div.removeChild(modal)
        } else {
            textfield.focus()
            textfield.select()
        }
    })
    
    textfield.addEventListener("keyup", event => {
        event.preventDefault()
        if (event.keyCode !== 13) return
        if (set_name(textfield.value.trim())) {
            chat_div.removeChild(modal)
        } else {
            textfield.select()
        }
    })

    textfield.focus()
    textfield.select()
}

function repaint_userlist(presence) {
    console.log("chat: new presence", presence.list())
    users = []
    while (userlist.firstChild) userlist.removeChild(userlist.firstChild)
    presence.list((_id, user) => {
        users.push(user)

        const nickname = user.member ? user.nickname : user.metas[0].nickname
        
        const e = document.createElement("div")
        e.className = "user"

        const user_name = document.createElement("span")
        user_name.className = "user_name"
        user_name.textContent = nickname

        user_name.classList.toggle("mod", user.mod || false)
        user_name.classList.toggle("guest", !user.member)

        e.appendChild(user_name)
        userlist.appendChild(e)
    })

    user_count.textContent = users.length + (users.length > 1 ? " users connected" : " user connected")
}

function chat_send_msg() {
    let text = chat_input.value.trim()
    chat_input.value = ""

    if (text.length <= 0) return

    channel.push("chat", {msg: text})
}

let unread_messages = 0

function on_chat(socket, data) {
    console.log("chat: chat", data)
    const msg = document.createElement("div")
    const username = document.createElement("span")
    const separator = document.createElement("span")
    separator.textContent = ": "
    username.className = "message_user"
    username.textContent = data.name

    if (data.sender == "sys") {
        msg.style.fontStyle = "italic"
        msg.appendChild(username)
        msg.appendChild(separator)
    } else {
        //notify browser title
        if (!document.hasFocus()) {
            unread_messages = unread_messages + 1
            document.title = `${unread_messages} • ${socket.room}`
        }
    }

    if (data.name != last_chat_user) {
        if (last_chat_user.length != 0)
            msg.style.marginTop = "0.5em"
        
        if (data.sender != "sys") {
            const d = new Date()
            const timestamp = document.createElement("span")
            timestamp.className = "message_timestamp"
            timestamp.textContent = "["
                + pad(d.getHours(), 2) + ":"
                + pad(d.getMinutes(), 2) + ":"
                + pad(d.getSeconds(), 2) + "] "

            msg.appendChild(timestamp)
            msg.appendChild(username)
            msg.appendChild(separator)
        }
        last_chat_user = data.name
    }

    const message_content = document.createElement("span")
    message_content.className = "message_content"
    msg.appendChild(message_content)
    
    if (data.content.indexOf("&gt;") == 0) {
        message_content.style.color = "#789922"
    }

    message_content.innerHTML = data.content

    messages.appendChild(msg)

    freeze_gifs(message_content)

    messages_outer.scrollTop = messages_outer.scrollHeight
}

function on_history(data) {
    console.log("chat: history", data)
    
    data.list.reverse().forEach(message => {
        const msg = document.createElement("div")
        const username = document.createElement("span")
        const separator = document.createElement("span")
        separator.textContent = ": "
        username.className = "message_user"

        if (last_chat_user != message.name) {
            if (last_chat_user.length != 0)
                msg.style.marginTop = "0.5em"
            
            username.textContent = message.name

            msg.appendChild(username)
            msg.appendChild(separator)
        }

        last_chat_user = message.name

        const message_content = document.createElement("span")
        message_content.className = "message_content"
        msg.appendChild(message_content)
        
        if (message.msg.indexOf("&gt;") == 0) {
            message_content.style.color = "#789922"
        }

        message_content.innerHTML = message.msg

        messages.appendChild(msg)

        freeze_gifs(message_content)

        messages_outer.scrollTop = messages_outer.scrollHeight

    })

    messages.appendChild(document.createElement("hr"))
}

function set_name(name) {
    if (name.length > 0) {
        if (name != "anon") {
            set_cookie("nickname", name)
        }
        
        channel.push("setname", {name: name})
        return true
    } else {
        return false
    }
}

function freeze_gifs(message) {
    for (const e of message.children) {
        if (e.tagName != "IMG") continue

        if (!freezeframe_loaded) return
        const message_gif = new Freezeframe(e, {
            trigger: false,
            responsive: false
        })
        
        const observer = new MutationObserver(() => {
            message_gif.start()
            observer.disconnect()
        })

        Object.defineProperty(message_gif.items, "push", {
            enumerable: false,
            configurable: false,
            writable: false,
            value: function () {
                for (var i = 0, n = this.length, l = arguments.length; i < l; i++, n++) {          
                    this[n] = arguments[i]

                    const observer = new MutationObserver(() => {
                        observer.disconnect()
                        messages_outer.scrollTop = messages_outer.scrollHeight
                    })

                    observer.observe(arguments[i].$container, {
                        attributes: true, 
                        attributeFilter: ['class'],
                        childList: false, 
                        characterData: false
                    })
                }
                
                if (!(message_gif in gifs))
                    gifs.push(message_gif)
                
                return n
            }
        })
    }
}

export default init
