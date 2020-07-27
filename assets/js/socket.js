import {Socket} from "phoenix"
import {get_meta, enter, create_element} from "./util"
import {get_cookie, set_cookie} from "./cookies"
import Modal from "./modals"

const token = get_meta("guardian_token")

const params = {}
if (token.length > 0) {
    params.token = token
}

const socket_modal = new Modal({title: "connecting to socket", can_close: false})
socket_modal.e.style.background = "none"
socket_modal.show()

const socket = new Socket("/tube", {params: params})
socket.room = get_meta("room")
socket.password = ""

socket.onOpen(() => {
    document.title = socket.room
    socket_modal.close()
})

socket.onError(() => document.title = "disconnected")

socket.onClose(() => document.title = "disconnected")

socket.connect()

function auth(socket, channels) {
    
    function connect(password="", password_modal=null) {
        socket.password = password

        const connecting_modal = new Modal({title: "connecting", can_close: false})
        connecting_modal.e.style.background = "none"

        const connecting_modal_body = connecting_modal.get_body()

        for (const channel of channels) {
            const channel_div = create_element(connecting_modal_body, "div")
            channel_div.style.lineHeight = "1em"
            if (channel != channels[0]) channel_div.style.marginTop = "0.5em"

            const channel_name = create_element(channel_div, "span")
            channel_name.textContent = channel.constructor.name

            channel.status = create_element(channel_div, "span")
            channel.status.style.float = "right"
            channel.status.style.marginLeft = "1em"
        }
        
        const first_channel = channels[0]
        first_channel.status.textContent = "↻"

        first_channel.connect(socket)
        .receive("ok", () => {
            first_channel.status.textContent = "✔"

            if (password_modal) {
                password_modal.close()
                const room_passwords = get_cookie("room_passwords") || {}
                room_passwords[socket.room] = password
                set_cookie("room_passwords", room_passwords)
            }
            
            if (channels.length > 1) {
                for (const channel of channels.slice(1)) {
                    channel.status.textContent = "↻"
                    channel.connect(socket)
                    .receive("ok", () => {
                        channel.status.textContent = "✔"
                        let complete = true
                        for (const channel2 of channels) {
                            if (channel2.status.textContent != "✔") {
                                complete = false
                                break
                            }
                        }
                        if (complete) {
                            connecting_modal.close()
                        }
                    })
                    .receive("error", _ => {
                        channel.status.textContent = "✘"
                    })
                }
            }
            else {
                connecting_modal.close()
            }
        })
        .receive("error", resp => {
            first_channel.status.textContent = "✘"
            if (resp == "bad password") {
                new Modal({title: "bad password"}).show()
                first_channel.channel.leave()
            }
            setTimeout(() => connecting_modal.close(), 250)
        })

        connecting_modal.show()
    }

    socket.onOpen(() => {
        if (get_meta("room_has_password")) {
            const password_modal = new Modal({title: "password", can_close: false})
            const modal_body = password_modal.get_body()

            const password_input = create_element(modal_body, "input")
            password_modal.back.addEventListener("click", _ => password_input.focus())
            password_input.addEventListener("keyup", event => enter(event, () => connect(password_input.value, password_modal)))

            const password_submit = create_element(modal_body, "button")
            password_submit.textContent = "join"
            password_submit.style.display = "block"
            password_submit.style.marginTop = "0.5em"
            password_submit.addEventListener("click", () => connect(password_input.value, password_modal))
            
            password_modal.show()
            password_input.focus()

            const room_passwords = get_cookie("room_passwords")
            if (room_passwords && socket.room in room_passwords) {
                connect(room_passwords[socket.room], password_modal)
            }
        } else {
            connect()
        }
    })
    
}

export default socket
export {auth}
