import { Socket } from "phoenix"
import { get_meta, enter, create_element } from "./util"
import { get_cookie, set_cookie } from "./cookies"
import { create_window } from "./window"
import Window from "./window"

const token = get_meta("guardian_token")

const params = {}
if (token.length > 0) {
  params.token = token
}

const socket_modal = create_window("socket_connect", { title: "Connecting to socket", can_close: false })
socket_modal.e.style.background = "none"

const socket = new Socket("/tube", { params: params })
socket.room = get_meta("room")
socket.password = ""

socket.onOpen(() => {
  document.title = socket.room
  console.log("socket: connected, closing modal")
  socket_modal.close()
})

socket.onError(e => {
  console.log("socket: error", e)
  document.title = "disconnected"
})

socket.onClose(() => {
  console.log("socket: closed")
  console.log("socket: should reconnect?")
  document.title = "disconnected"
  socket_modal.show()
})

socket.connect()

function auth(socket, channels) {
  function connect(password = "", password_modal = null) {
    socket.password = password

    const t = new Date().getTime()
    console.log("connecting to channels", t)
    socket.connecting_modal = create_window("socket_channel", {
      title: `connecting ${t}`,
      can_close: false,
      show: false
    })

    const connecting_modal_body = socket.connecting_modal.get_body()

    while (connecting_modal_body.firstChild) {
      connecting_modal_body.removeChild(connecting_modal_body.firstChild)
    }

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

    socket.connecting_modal.show()
    const first_channel = channels[0]
    first_channel.status.textContent = "↻"

    first_channel.connect(socket)
      .receive("ok", () => {
        first_channel.status.textContent = "✔"
        console.log("socket: connected to first channel")

        if (password_modal) {
          password_modal.close()
          const room_passwords = get_cookie("room_passwords") || {}
          room_passwords[socket.room] = password
          set_cookie("room_passwords", room_passwords)
        }

        if (channels.length > 1) {
          console.log("socket: connecting to rest of channels")
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
                  socket.connecting_modal.close()
                }
              })
              .receive("error", _ => {
                channel.status.textContent = "✘"
              })
          }
        }
        else {
          socket.connecting_modal.close()
        }
      })
      .receive("error", resp => {
        first_channel.status.textContent = "✘"
        if (resp == "bad password") {
          new Window({ title: "bad password", modal: true }).on_close = () => {
            password_modal.input.focus()
          }

          first_channel.channel.leave()
        }
        setTimeout(() => socket.connecting_modal.close(), 250)
      })
  }

  socket.onOpen(() => {
    if (get_meta("room_has_password")) {
      const password_modal = create_window("socket_password", { title: "password", modal: true, can_close: false, show: false })
      const modal_body = password_modal.get_body()
      while (modal_body.firstChild) modal_body.removeChild(modal_body.firstChild)

      password_modal.input = create_element(modal_body, "input")
      password_modal.back.addEventListener("click", _ => password_modal.input.focus())
      password_modal.input.addEventListener("keyup", event => enter(event, () => connect(password_modal.input.value, password_modal)))

      const password_submit = create_element(modal_body, "button")
      password_submit.textContent = "join"
      password_submit.style.display = "block"
      password_submit.style.marginTop = "0.5em"
      password_submit.addEventListener("click", () => connect(password_modal.input.value, password_modal))

      password_modal.show()
      password_modal.input.focus()

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
export { auth }
