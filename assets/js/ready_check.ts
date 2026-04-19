import { ViewHook } from "phoenix_live_view/assets/js/types"

const sound = new Audio("/includes/ready.ogg")
sound.preload = "auto"

export default class ReadyCheck {
    #el
    #title
    #pie: HTMLElement
    #members
    constructor(v: ViewHook, root: HTMLElement) {
        const el = document.createElement("div")
        el.className = "ready-check"
        root.appendChild(el)
        this.#el = el

        el.innerHTML = `
        <div>
            <div class="title">Waiting for other players...</div>
            <div class="pie"></div>
            <button>Accept</button>
            <div class="members"></div>
        </div>
        `

        el.querySelector("button")!.addEventListener("click", () => {
            v.pushEvent("ready")
        })

        this.#title = el.querySelector(".title")!
        this.#pie = el.querySelector(".pie")!
        this.#members = el.querySelector(".members")!
    }

    #interval: any
    #timeout: any
    #started = 0
    update(data: { total: number, members: string[] }) {
        this.#pie.style.setProperty("--p", "1")

        if (this.#started == 0) {
            this.#started = performance.now()
            sound.currentTime = 0
            sound.play()
        }

        clearInterval(this.#interval)
        clearInterval(this.#timeout)

        this.#interval = setInterval(() => {
            const v = (10 - (performance.now() - this.#started) / 1000) / 10
            this.#pie.style.setProperty("--p", v.toString())
        }, 200)

        this.#timeout = setTimeout(() => {
            clearInterval(this.#interval)
            this.#started = 0
            this.#el.classList.toggle("visible", false)
        }, 10000)

        const user_id = document.getElementById("user_id")?.getAttribute("value")!

        this.#el.classList.toggle("visible", true)
        this.#el.classList.toggle("ready", data.members.includes(user_id))

        if (data.members.includes(user_id)) {
            this.#title.textContent = "Waiting for other players..."
            while (this.#members.firstChild) this.#members.removeChild(this.#members.firstChild)
            for (let i = 0; i < data.total; i++) {
                const el = document.createElement("img")
                el.src = i < data.members.length ? "https://r2tube.grass.moe/ready/ready.png" : "https://r2tube.grass.moe/ready/unready.png"

                this.#members.appendChild(el)
            }
        }
        else {
            this.#title.textContent = "Match found!"
        }
    }

    finish() {
        sound.pause()
        this.#started = 0
        this.#el.classList.toggle("visible", false)
        clearInterval(this.#interval)
        clearInterval(this.#timeout)
    }
}