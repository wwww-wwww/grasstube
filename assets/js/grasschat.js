import css from "../css/chat.css"
import "phoenix_html"

import {Presence} from "phoenix"

import Modal from "./modals"

import {reload_emotes} from "./metadata"
import {pad, enter} from "./extras"
import {get_cookie, set_cookie} from "./cookies"

let freezeframe_loaded = false
const gifs = []

class Chat {
    constructor() {
        this.socket = null
        this.channel = null
        this.users = []
        this.last_chat_user = ""
        this.unread_messages = 0
        
        if (!freezeframe_loaded) {
            const freezeframe_script = document.createElement("script")
            freezeframe_script.src = "https://unpkg.com/freezeframe/dist/freezeframe.min.js"
            freezeframe_script.addEventListener("load", () => {
                console.log("freezeframe: loaded")
                freezeframe_loaded = true
        
                for (const e of document.getElementsByClassName("message_content"))
                    freeze_gifs(e)
            })
            document.head.appendChild(freezeframe_script)
            
            window.addEventListener("focus", () => {
                messages.classList.toggle("freeze", false)
                this.unread_messages = 0
                if (this.socket)
                    document.title = this.unread_messages > 0 ? `${this.unread_messages} • ${this.socket.room}` : this.socket.room
            })

            window.addEventListener("blur", () => {
                if ((get_cookie("freezeframe") || 0))
                    messages.classList.toggle("freeze", true)
            })

            messages.classList.toggle("freeze", !document.hasFocus() && (get_cookie("freezeframe") || 0))
        }
        
        chat_input.addEventListener("keyup", event => { enter(event, () => this.send_msg()) })
        btn_userlist_toggle.addEventListener("click", e => {
            userlist.classList.toggle("hidden")
        })

        window.addEventListener("resize", _ => {
            if (document.getElementById("chat_div")) {
                userlist.classList.toggle("userlist-float", chat_div.getBoundingClientRect().width < 400)
            }
        })
        window.dispatchEvent(new Event("resize"))

        const settings_modal = this.make_settings()
        btn_chat_settings.addEventListener("click", () => settings_modal.show())

        const emotes_modal = new Modal({title: "emotes"})
        
        btn_show_emotes.addEventListener("click", () => {
            reload_emotes(this.socket.room, emotes_modal, chat_input)
            emotes_modal.show()
        })
        
    }

    connect(socket) {
        this.socket = socket
        
        console.log("chat: connecting to room " + this.socket.room)
        this.channel = this.socket.channel("chat:" + this.socket.room, {password: this.socket.password})
    
        this.presence = new Presence(this.channel)
    
        this.presence.onSync(() => this.repaint_userlist())
    
        this.channel.on("chat", data => this.on_chat(data))
    
        this.channel.on("history", data => this.on_history(data))
    
        return this.channel.join()
        .receive("ok", resp => {
            const nickname = get_cookie("nickname")
            if (nickname || false) this.set_name(nickname)
            console.log("chat: connected", resp)
        })
        .receive("error", resp => {
            console.log("chat: failed to connect", resp)
        })
    }

    send_msg() {
        let text = chat_input.value.trim()
        chat_input.value = ""
    
        if (text.length <= 0) return
    
        this.channel.push("chat", {msg: text})
    }
    
    repaint_userlist() {
        console.log("chat: new presence", this.presence.list())
        this.users = []
        while (userlist.firstChild) userlist.removeChild(userlist.firstChild)
        this.presence.list((_id, user) => {
            this.users.push(user)

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

        user_count.textContent = this.users.length + (this.users.length > 1 ? " users connected" : " user connected")
    }

    on_chat(data) {
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
                this.unread_messages = this.unread_messages + 1
                document.title = `${this.unread_messages} • ${this.socket.room}`
            }
        }
    
        if (data.name != this.last_chat_user) {
            if (this.last_chat_user.length != 0)
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
            this.last_chat_user = data.name
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

    set_name(name) {
        if (name.length > 0) {
            if (name != "anon") {
                set_cookie("nickname", name)
            }
            
            this.channel.push("setname", {name: name})
            return true
        } else {
            return false
        }
    }
    
    on_history(data) {
        console.log("chat: history", data)
        
        data.list.reverse().forEach(message => {
            const msg = document.createElement("div")
            const username = document.createElement("span")
            const separator = document.createElement("span")
            separator.textContent = ": "
            username.className = "message_user"

            if (this.last_chat_user != message.name) {
                if (this.last_chat_user.length != 0)
                    msg.style.marginTop = "0.5em"
                
                username.textContent = message.name

                msg.appendChild(username)
                msg.appendChild(separator)
            }

            this.last_chat_user = message.name

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

    make_settings() {
        const modal = new Modal({title: "chat settings", root: chat_div})
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

        const change_nickname_modal = this.make_change_nickname()
        change_nickname.addEventListener("click", () => {
            change_nickname_modal.show()
            change_nickname_modal.textfield.focus()
            change_nickname_modal.textfield.select()
        })

        return modal
    }

    make_change_nickname() {
        const modal = new Modal({title: "change your nickname", root: chat_div})

        const modal_body = modal.get_body()
        modal_body.style.textAlign = "right"

        modal.textfield = document.createElement("input")
        modal_body.appendChild(modal.textfield)

        modal.textfield.style.display = "block"
        modal.textfield.style.width = "100%"
        modal.textfield.value = get_cookie("nickname") || "anon"

        const btn_set = document.createElement("button")
        modal_body.appendChild(btn_set)

        btn_set.textContent = "set"
        btn_set.style.marginTop = "0.5em"

        btn_set.addEventListener("click", () => {
            if (this.set_name(modal.textfield.value.trim())) {
                modal.close()
            } else {
                modal.textfield.focus()
                modal.textfield.select()
            }
        })
        
        modal.textfield.addEventListener("keyup", event => {
            event.preventDefault()
            if (event.keyCode !== 13) return
            if (this.set_name(modal.textfield.value.trim())) {
                modal.close()
            } else {
                modal.textfield.select()
            }
        })

        return modal
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

export default Chat
