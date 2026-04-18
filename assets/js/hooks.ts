import { ViewHook } from "phoenix_live_view"
import GrassPlayer from "./grassplayer2/grassplayer2"

const state: { player: GrassPlayer | null } = { player: null }

function pad(n: number, width: number) {
    return n.toString().padStart(width, "0")
}

function seconds_to_hms(seconds: number, hide_hours = false) {
    seconds = Math.round(seconds)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor(seconds / 60) % 60
    seconds = seconds % 60
    if (hide_hours && hours <= 0) return `${pad(minutes, 2)}:${pad(seconds, 2)}`
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`
}

class video extends ViewHook {
    #ping_interval: any = null
    #last_ping = 0
    #latency_rtt = 0

    ping() {
        const ping_time = performance.now()
        this.pushEvent("ping", {}, () => {
            this.#last_ping = performance.now() - ping_time
            this.#latency_rtt =
                this.#last_ping * 0.25 + (this.#latency_rtt || this.#last_ping) * 0.75
        })
    }

    mounted() {
        const player = new GrassPlayer(this.el)
        state.player = player

        this.handleEvent("video_set", data => {
            player.set_video(data.type, data.video_url, data.subtitles_url)
        })

        this.handleEvent("video_playing", data => {
            if (data.playing != player.playing()) {
                player.create_message(data.playing ? "Play" : "Pause", 1000)
                player.auto_set_playing(data.playing)
            }
        })

        this.handleEvent("video_time", data => {
            const t = data.time + Math.min(this.#latency_rtt / 1000, 1)
            player.create_message(seconds_to_hms(data.time, true), 1000)
            player.auto_seek(t)
            player.set_catchup(t, performance.now())
        })

        this.handleEvent("video_sync", data => {
            const playing = player.playing()

            if (data.playing != playing) {
                player.create_message(data.playing ? "Play" : "Pause", 1000)
                player.auto_set_playing(data.playing)
            }

            if (!data.playing) {
                player.auto_seek(data.time)
                return
            }

            const t = data.time + Math.min(this.#latency_rtt / 1000, 1)

            if (t >= player.duration()) return

            const diff = Math.abs(t - player.current_time())
            if (data.playing != playing && diff > 0.1) {
                player.auto_seek(t)
            } else if (diff > 5) {
                player.auto_seek(t)
            }

            player.set_catchup(t, performance.now())
        })

        player.on_next = () => {
            this.pushEvent("video_next", {})
        }

        player.on_buffer_end = buffered => {
            // if (buffered == last_buffered) return
            // last_buffered = buffered
            // this.pushEvent("buffered", { buffered: buffered })
        }

        player.on_toggle_playing = playing => {
            this.pushEvent("video_playing", { playing: playing, offset: -this.#latency_rtt / 1000 })
        }

        player.on_seek = t => {
            this.pushEvent("video_seek", { time: t })
        }

        this.ping()
        this.#ping_interval = setInterval(() => this.ping(), 2000)
    }

    destroyed() {
        clearInterval(this.#ping_interval)
        state.player!.destroy()
    }
}

class modal_fullscreen extends ViewHook {
    mounted() {
        const chk: HTMLInputElement = document.getElementById(
            this.el.getAttribute("chk")!,
        ) as HTMLInputElement
        this.el.addEventListener("click", e => {
            if (e.target == this.el) {
                chk.checked = false
            }
        })

        this.el.querySelector(".close")!.addEventListener("click", () => {
            chk.checked = false
        })
    }
}

const video_exts = [".mp4", ".webm"]
async function scan(url: URL) {
    return fetch(url.toString())
        .then(res => res.text())
        .then(async t => {
            const doc = document.createElement("div")
            doc.innerHTML = t
            const urls = [...doc.getElementsByTagName("a")]
                .map(x => x.getAttribute("href") || "")
                .map(x => new URL(x, url))
                .filter(x => x.href.startsWith(url.href))

            const files = urls.filter(x => !x.href.endsWith("/"))
            let folders: any = urls.filter(x => x.href.endsWith("/"))
            folders = await Promise.all(folders.map(async (f: any) => [f, await scan(f)]))

            return { folders, files }
        })
}

function build_tree(m: any, root: HTMLElement, tree: any) {
    tree.folders.forEach((f: any) => {
        const el = document.createElement("div")
        el.className = "folder"
        root.appendChild(el)

        el.innerHTML = `
            <div class="header"><button class="refresh"></button><span>${f[0]}</span></div>
            <div class="body"></div>
        `

        el.querySelector(".header")!.addEventListener("click", () => {
            el.classList.toggle("uncollapsed", !el.classList.contains("uncollapsed"))
        })
        build_tree(m, el.querySelector(".body")!, f[1])
    })

    tree.files
        .filter((x: URL) =>
            video_exts.some(e => x.pathname.split("/").pop()!.toLowerCase().endsWith(e)),
        )
        .forEach((f: any) => {
            const file = document.createElement("div")
            file.className = "file"
            root.appendChild(file)
            file.innerHTML = `<button class="add"></button><span>${decodeURIComponent(f.pathname.split("/").pop())}</span>`
            file.querySelector(".add")!.addEventListener("click", () => {
                let subtitles_url: string | null = f.href.split(".").slice(0, -1).join(".") + ".ass"
                if (tree.files.filter((x: URL) => x.href == subtitles_url).length == 0) {
                    subtitles_url = null
                }
                m.pushEvent("playlist_add", { video_url: f.href, subtitles_url: subtitles_url })
            })
        })
}

class media_directories extends ViewHook {
    mounted() {
        this.el.querySelector(".top > .close")!.addEventListener("click", () => {
            ; (document.getElementById("chk_show_playlist_form") as HTMLInputElement).checked = false
        })
        const directories = JSON.parse(this.el.getAttribute("directories")!)
        Promise.all(directories.map(async (url: string) => [url, await scan(new URL(url))])).then(
            folders => build_tree(this, this.el.querySelector(".list")!, { files: [], folders }),
        )
    }
}

class poll_form extends ViewHook {
    mounted() {
        const form = this.el.querySelector("form")!
        const update_names = () => {
            Array.from(form.getElementsByTagName("input"))
                .filter((x: any) => x.name != "name")
                .forEach((x: any, i) => {
                    x.name = i
                })
        }

        this.el.querySelector(".btn-add-option")!.addEventListener("click", () => {
            const option = document.createElement("div")
            form.appendChild(option)
            option.innerHTML = `
            <input placeholder="Option" autocomplete="off"/>
            <button class="close"></button>
            `
            update_names()
            option.querySelector("button")!.addEventListener("click", () => {
                form.removeChild(option)
                update_names()
            })
            option.querySelector("input")!.focus()
        })
    }
}

class chat extends ViewHook {
    send_message(message: string) {
        this.pushEvent("send_message", { message: message })
    }

    mounted() {
        const input: HTMLInputElement = this.el.querySelector(".message-input")!
        const emotes: HTMLElement = this.el.querySelector(".emotes")!
        const messages: HTMLElement = this.el.querySelector(".messages")!
        const keybinds: Record<string, string> = JSON.parse(this.el.getAttribute("keybinds")!)

        document.addEventListener("keypress", (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName == "INPUT") return
            if (e.key == "Enter") {
                e.preventDefault()
                input.classList.toggle("visible", true)
                input.focus()
            }
        })

        input.addEventListener("keypress", (e: KeyboardEvent) => {
            if (e.key == "Enter") {
                e.preventDefault()
                this.send_message(input.value)
                input.value = ""
                input.classList.toggle("visible", false)
                emotes.classList.toggle("visible", false)
            }
        })

        let title_notifying = false
        let original_title = document.title
        let unread_messages = 0

        window.addEventListener("focus", () => {
            unread_messages = 0
            document.title = original_title
            title_notifying = false
        })

        this.handleEvent("message", data => {
            const el = document.createElement("div")
            el.classList.toggle("message", true)
            el.classList.toggle("visible", true)
            messages.prepend(el)
            el.innerHTML = `<span class="time">[${data.time}]</span><span><span>${data.sender}</span>:</span>${data.html}`
            setTimeout(() => {
                el.classList.toggle("visible", false)
            }, 5000)

            const opts = data.opts || {}

            if (opts.notify && !document.hasFocus()) {
                unread_messages++

                if (!title_notifying) {
                    original_title = document.title
                    title_notifying = true
                }

                document.title = `${unread_messages} • ${original_title}`
            }

            if (opts.effect == "bullet") {
                const el = document.createElement("div")
                el.innerHTML = data.html
                el.className = "bullet"
                el.style.top = `${Math.random() * 100}%`
                messages.appendChild(el)

                setTimeout(() => {
                    messages.removeChild(el)
                }, 5000)
            }
        })

        document.addEventListener("keypress", e => {
            if ((e.target as HTMLElement).tagName == "INPUT") return

            if (e.key == "e") {
                e.preventDefault()
                emotes.classList.toggle("visible")
            }
            if (e.key in keybinds) {
                e.preventDefault()
                this.send_message(keybinds[e.key])
            }
        })

        Array.from(emotes.getElementsByClassName("emote")).forEach(e => {
            e.addEventListener("click", () => {
                if (input.classList.contains("visible")) {
                    input.value += `:${e.getAttribute("name")}: `
                    input.focus()
                } else {
                    this.send_message(`:${e.getAttribute("name")}:`)
                    emotes.classList.toggle("visible", false)
                }
            })
        })
    }
}

export default { video, modal_fullscreen, media_directories, poll_form, chat }
