import { ViewHook } from "phoenix_live_view/assets/js/types"

const sound = new Audio("/includes/ready.ogg")
sound.preload = "auto"

// must match @ready_check_timeout in chat_agent.ex
const TIMEOUT_MS = 10000

export default class ReadyCheck {
    #el: HTMLElement
    #title: HTMLElement
    #pie: HTMLElement
    #members: HTMLElement
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
            v.pushEvent("ready", {})
        })

        this.#title = el.querySelector(".title")!
        this.#pie = el.querySelector(".pie")!
        this.#members = el.querySelector(".members")!
    }

    #interval: ReturnType<typeof setInterval> | undefined
    #timeout: ReturnType<typeof setTimeout> | undefined
    #started = 0

    #tick() {
        const p = 1 - (performance.now() - this.#started) / TIMEOUT_MS
        this.#pie.style.setProperty("--p", Math.max(0, Math.min(1, p)).toString())
    }

    update(data: { total: number, members: string[] }) {
        if (this.#started == 0) {
            this.#started = performance.now()
            sound.currentTime = 0
            sound.play().catch(() => { })

            this.#interval = setInterval(() => this.#tick(), 200)
            // fallback in case ready_fail is never received
            this.#timeout = setTimeout(() => this.finish(), TIMEOUT_MS + 1000)
        }
        this.#tick()

        const user_id = document.getElementById("user_id")?.getAttribute("value") ?? ""
        const ready = data.members.includes(user_id)

        this.#el.classList.toggle("visible", true)
        this.#el.classList.toggle("ready", ready)
        this.#title.textContent = ready ? "Waiting for other players..." : "Match found!"

        this.#members.replaceChildren()
        for (let i = 0; i < data.total; i++) {
            const img = document.createElement("img")
            img.src = i < data.members.length ? "https://r2tube.grass.moe/ready/ready.png" : "https://r2tube.grass.moe/ready/unready.png"
            this.#members.appendChild(img)
        }
    }

    finish() {
        sound.pause()
        this.#started = 0
        this.#el.classList.toggle("visible", false)
        this.#el.classList.toggle("ready", false)
        clearInterval(this.#interval)
        clearTimeout(this.#timeout)
    }

    destroy() {
        this.finish()
        this.#el.remove()
    }
}
