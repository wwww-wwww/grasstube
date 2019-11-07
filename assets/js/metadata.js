const emotes = {}
let emotes_data = ""
const hosted_videos = {}

function reload_emotes(room, modal, chatbox, refresh = true, new_data = false) {
    if (modal == null || modal == undefined) return

    const modal_body = modal.get_body()
    if (new_data) {
        modal_body.style.textAlign = "center"
        const sorted_keys = Object.keys(emotes).sort()
        sorted_keys.forEach(emote => {
            const emote_img = document.createElement("img")
            emote_img.src = emotes[emote]
            emote_img.alt = `:${emote}:`
            emote_img.title = `:${emote}:`
            emote_img.style.padding = "4px"
            emote_img.style.maxHeight = "100px"
            emote_img.addEventListener("click", () => {
                chatbox.value += `:${emote}: `
                modal.close()
                chatbox.focus()
            })
            modal_body.appendChild(emote_img)
        })
    }

    if (refresh) {
        fetch(`/api/emotes/r/${room}`, { headers: { "Content-Type": "application/json; charset=utf-8" }})
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                
                const new_data = JSON.stringify(data)
                if (emotes_data != new_data){
                    while (modal_body.firstChild) modal_body.removeChild(modal_body.firstChild)
                    for (const emote in emotes) delete emotes[emote]
                    data.emotes.forEach(emote => {
                        emotes[emote["emote"]] = emote["url"]
                    })
                    reload_emotes(room, modal, chatbox, false, true)
                }
                emotes_data = new_data
                
                console.log("emotes: fetched")
            } else {
                console.log("emotes: bad room")
            }
        })
        .catch(err => {
            console.log("emotes: error fetching", err)
        })
    }
}

function reload_hosted_videos(modal, channel, url, download=true) {
    if (modal == null || modal == undefined) return
    console.log(url)
    if (download) {
        const xhr = new XMLHttpRequest()
        xhr.open("GET", url)

        xhr.responseType = "json"
        
        xhr.onload = function() {
            if (!(url in hosted_videos) || xhr.response != hosted_videos[url]) {
                hosted_videos[url] = xhr.response
                reload_hosted_videos(modal, channel, url, false)
            }
            console.log("videos: fetched")
        }

        xhr.onerror = function() {
            console.log("videos: error fetching")
        }
        xhr.send()
        return
    }
    
    const modal_body = modal.get_body()
    
    while (modal_body.firstChild) modal_body.removeChild(modal_body.firstChild)
    let color = "rgba(255, 255, 255, 0)"
    
    hosted_videos[url].forEach(v => {
        const item = document.createElement("div")
        item.className = "list-item"
        item.style.backgroundColor = color
        color = (color == "rgba(255, 255, 255, 0.15)") ? "rgba(255, 255, 255, 0)" : "rgba(255, 255, 255, 0.15)"

        const title = document.createElement("span")
        title.textContent = v.title
        title.style.marginRight = "0.5em"
        item.appendChild(title)

        const btn_add = document.createElement("button")
        btn_add.textContent = "add"
        btn_add.style.float = "right"
        btn_add.style.lineHeight = "1em"
        btn_add.style.padding = "0em 0.5em"

        btn_add.addEventListener("click", () => {
            channel.push("q_add", {
                title: "",
                url: v.url,
                sub: v.sub,
                small: v.small || ""
            })
        })

        item.appendChild(btn_add)
        
        modal_body.appendChild(item)
    })
}

export {reload_emotes, reload_hosted_videos}
