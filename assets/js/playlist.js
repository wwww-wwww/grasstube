import "phoenix_html"
import Modal from "./modals"
import {reload_hosted_videos} from "./metadata"
import {seconds_to_hms, enter, unescape_html} from "./extras"

class Playlist{
    constructor() {
        this.channel = null
        this.has_controls = false
        this.playlist = []
        this.current_video = -1

        playlist_add.addEventListener("click", () => this.queue_add())

        add_url.addEventListener("keyup", event => { enter(event, () => { this.queue_add() }) })
        add_sub.addEventListener("keyup", event => { enter(event, () => { this.queue_add() }) })
    
        const hosted_videos_modal = new Modal({title: "hosted videos"})
        btn_show_hosted_videos.addEventListener("click", () => {
            reload_hosted_videos(hosted_videos_modal, this.channel, "https://okea.moe/video/list.json")
            hosted_videos_modal.show()
        })
    
        const hosted_videos_ss_modal = new Modal({title: "ss"})
        btn_show_ss.addEventListener("click", () => {
            reload_hosted_videos(hosted_videos_ss_modal, this.channel, "https://okea.moe/ss/list.json")
            hosted_videos_ss_modal.show()
        })
    
        const yt_modal = create_yt_modal()
    
        btn_show_yt.addEventListener("click", () => {
            yt_modal.show()
            yt_modal.search_input.focus()
            yt_modal.search_input.select()
        })
    }

    queue_set(e) {
        for (let i = 0; i < this.playlist.length; i++) {
            if (this.playlist[i].q_set == e.target) {
                this.channel.push("q_set", {id: this.playlist[i].id})
                break
            }
        }
    }
    
    queue_remove(e) {
        for (let i = 0; i < this.playlist.length; i++) {
            if (this.playlist[i].q_del == e.target) {
                this.channel.push("q_del", {id: this.playlist[i].id})
                break
            }
        }
    }
    
    queue_start_drag(e) {
        for (let i = 0; i < this.playlist.length; i++) {
            if (this.playlist[i].q_move == (e.touches ? e.touches[0].target : e.target)) {
                this.playlist[i].dragging = true
                this.playlist[i].e.classList.toggle("playlist_dragging", true)
                
                document.addEventListener("mouseup", e => this.queue_stop_drag(e))
                document.addEventListener("mousemove", e => this.queue_drag(e))
                document.addEventListener("touchend", e => this.queue_stop_drag(e))
                document.addEventListener("touchmove", e => this.queue_drag(e))
                break
            }
        }
    }
    queue_stop_drag(_) {
        for (let i = 0; i < this.playlist.length; i++) {
            this.playlist[i].e.style.transform = "none"
            if (this.playlist[i].dragging) {
                this.playlist[i].dragging = false
                this.playlist[i].e.classList.toggle("playlist_dragging", false)

                const new_order = []
                this.playlist.forEach(playlist_item => {
                    new_order.push(playlist_item.id)
                })
                this.channel.push("q_order", {order: new_order})
            }
        }
        document.removeEventListener("mouseup", e => this.queue_stop_drag(e))
        document.removeEventListener("mousemove", e => this.queue_drag(e))
        document.removeEventListener("touchend", e => this.queue_stop_drag(e))
        document.removeEventListener("touchmove", e => this.queue_drag(e))
    }

    queue_drag(e) {
        for (let i = 0; i < this.playlist.length; i++) {
            if (this.playlist[i].dragging) {
                const playlist_item = this.playlist[i]
                playlist_item.e.style.transform = "none"
                let rect = playlist_item.e.getBoundingClientRect()
                let mouse_y = Math.min(Math.max(e.touches ? e.touches[0].clientY : e.clientY,
                    this.playlist[0].e.getBoundingClientRect().y), this.playlist[this.playlist.length - 1].e.getBoundingClientRect().bottom)
                let y = rect.y
                let off = mouse_y - y - rect.height / 2
    
                for (let j = i - 1; j <= i + 1; j++) { // only 1 before and after
                    if (j < 0 || j == i || j >= this.playlist.length) continue
                    const playlist_item2 = this.playlist[j]
                    if ((j < i && mouse_y <= (playlist_item2.e.getBoundingClientRect().y + playlist_item2.e.getBoundingClientRect().height / 2)) || 
                        (j > i && mouse_y >= (playlist_item2.e.getBoundingClientRect().y + playlist_item2.e.getBoundingClientRect().height / 2)))
                    {
                        this.playlist.splice(i, 1)
                        this.playlist.splice(j, 0, playlist_item)
    
                        if (j < i) {
                            playlist_item.e.parentNode.insertBefore(playlist_item.e, playlist_item2.e)
                        } else {
                            playlist_item.e.parentNode.insertBefore(playlist_item2.e, playlist_item.e)
                        }
    
                        rect = playlist_item.e.getBoundingClientRect()
                        y = rect.y
                        off = mouse_y - y - rect.height / 2
                        break
                    }
                }
                playlist_item.e.style.transform = `translate(0, ${off}px)`
                break
            }
        }
    }

    queue_add() {
        this.channel.push("q_add", {
            url: add_url.value,
            sub: add_sub.value
        })
    
        add_url.value = ""
        add_sub.value = ""
    }

    connect(socket) {
        console.log("playlist: connecting to room " + socket.room)
        this.channel = socket.channel("playlist:" + socket.room, {password: socket.password})

        this.channel.on("playlist", data => this.on_playlist(data))

        this.channel.on("current", data => this.on_current(data))
    
        this.channel.on("controls", data => this.on_controls(data))

        return this.channel.join()
        .receive("ok", resp => {
            console.log("playlist: connected", resp) 
        })
        .receive("error", resp => {
            console.log("playlist: failed to connect", resp)
        })
    }

    on_controls(data) {
        console.log("playlist: controls", data)
        this.has_controls = true
    
        playlist_controls.classList.toggle("hidden", false)

        this.playlist.forEach(vid => {
            vid.q_set.classList.toggle("hidden", false)
            vid.q_del.classList.toggle("hidden", false)
            vid.q_move.classList.toggle("hidden", false)
        })
    
    }

    on_current(data) {
        console.log("playlist: current", data)

        this.current_video = data.id
        this.playlist.forEach(vid => {
            vid.e.classList.toggle("isactive", this.current_video == vid.id)
        })
    }

    on_playlist(data) {
        console.log("playlist: playlist", data)
        this.playlist.length = 0
        while (playlist_container.firstChild) playlist_container.removeChild(playlist_container.firstChild)
        
        if (data.playlist.length <= 0) {
            playlist_header_count.textContent = "playlist is empty"
            playlist_header_time.textContent = ""
        } else {
            playlist_header_count.textContent = data.playlist.length + " item" + ((data.playlist.length == 1) ? "" : "s")
            let time = 0
            for (let i = 0; i < data.playlist.length; i++) {
                const vid = data.playlist[i]

                time += vid.duration

                const e = document.createElement("div")
                e.className = "playlist_item"

                vid.title_e = document.createElement("a")
                vid.title_e.className = "playlist_item_title"
                e.appendChild(vid.title_e)
                
                vid.title_e.textContent = vid.title
                if (vid.url.length > 0) {
                    vid.title_e.href = vid.url
                }
        
                vid.duration_e = document.createElement("span")
                vid.duration_e.className = "playlist_item_duration"
                vid.duration_e.textContent = seconds_to_hms(vid.duration)

                vid.q_set = document.createElement("button")
                vid.q_set.className = "playlist_set"
                vid.q_set.textContent = "set"
                vid.q_del = document.createElement("button")
                vid.q_del.className = "playlist_remove square"
                vid.q_del.textContent = "×"

                vid.q_move = document.createElement("button")
                vid.q_move.className = "playlist_drag"
                vid.q_move.textContent = "☰"

                vid.q_move.addEventListener("mousedown", e => this.queue_start_drag(e))
                vid.q_move.addEventListener("touchstart", e => this.queue_start_drag(e))

                vid.q_set.addEventListener("click", e => this.queue_set(e))
                vid.q_del.addEventListener("click", e => this.queue_remove(e))
        
                vid.q_del.classList.toggle("hidden", !this.has_controls)
                vid.q_set.classList.toggle("hidden", !this.has_controls)
                vid.q_move.classList.toggle("hidden", !this.has_controls)

                e.prepend(vid.q_del)
                e.append(vid.duration_e)
                e.append(vid.q_set)
                e.append(vid.q_move)
        
                e.classList.toggle("isactive", vid.id == this.current_video)

                vid.e = e
                playlist_container.appendChild(e)
                this.playlist.push(vid)
            }
            playlist_header_time.textContent = seconds_to_hms(time)
        }
    }
}

function create_yt_modal() {
    const modal = new Modal({title: "yt"})

    const modal_body = modal.get_body()
    modal_body.style.display = "flex"
    modal_body.style.flexDirection = "column"

    modal.search_input = document.createElement("input")
    modal.search_input.style.display = "block"
    modal.search_input.style.marginBottom = "0.5em"
    modal.search_input.style.flex = "0"
    modal_body.appendChild(modal.search_input)

    let row = document.createElement("div")
    row.style.display = "block"
    row.style.flex = "1"
    row.style.minHeight = "0"
    row.style.overflow = "auto"
    row.style.borderBottom = "1px solid rgba(255, 255, 255, 0.6)"
    row.style.borderTop = "1px solid rgba(255, 255, 255, 0.6)"
    modal_body.appendChild(row)

    const videos_list = document.createElement("div")
    row.appendChild(videos_list)

    row = document.createElement("div")
    row.style.display = "block"
    row.style.flex = "0"
    modal_body.appendChild(row)

    let search_text = modal.search_input.value.trim()

    let search_timer = null

    modal.search_input.addEventListener("keyup", () => {
        const new_text = modal.search_input.value.trim()

        if (search_timer != null) clearTimeout(search_timer)

        search_timer = setTimeout(() => {
            if (search_text == new_text) return
            
            search_text = new_text
            
            fetch(`/api/yt_search?query=${encodeURIComponent(search_text)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    while (videos_list.firstChild) videos_list.removeChild(videos_list.firstChild)

                    for (const video of data.items) {
                        const video_id = unescape_html(video.id)
                        const video_url = `https://youtube.com/watch?v=${video_id}`
    
                        const video_e = document.createElement("div")
                        video_e.className = "yt-video"
                        
                        let column = document.createElement("div")
                        column.style.display = "flex"
                        column.style.alignItems = "center"
                        video_e.appendChild(column)

                        const video_e_thumbnail = document.createElement("img")
                        video_e_thumbnail.style.height = "6em"
                        video_e_thumbnail.src = `https://img.youtube.com/vi/${video_id}/mqdefault.jpg`
                        column.appendChild(video_e_thumbnail)
    
                        column = document.createElement("div")
                        column.style.padding = "0.5em"
                        column.style.flex = "1"
                        column.style.minWidth = "0"
                        video_e.appendChild(column)
    
                        let row = document.createElement("div")
                        column.appendChild(row)
    
                        const video_e_title = document.createElement("a")
                        video_e_title.textContent = unescape_html(video.title)
                        video_e_title.style.color = "rgba(255, 255, 255, 0.9)"
                        video_e_title.href = video_url
                        row.appendChild(video_e_title)
                        
                        row = document.createElement("div")
                        column.appendChild(row)
    
                        const video_e_author = document.createElement("a")
                        video_e_author.textContent = unescape_html(video.channel_title)
                        video_e_author.style.fontSize = "0.9em"
                        video_e_author.href = `https://youtube.com/channel/${video.channel_id}`
                        row.appendChild(video_e_author)
    
                        row = document.createElement("div")
                        column.appendChild(row)
                        
                        const video_add = document.createElement("button")
                        video_add.textContent = "add"
                        video_add.style.flex = "0"
                        video_e.appendChild(video_add)
    
                        video_add.addEventListener("click", () => {
                            channel.push("q_add", {
                                url: video_url,
                                sub: ""
                            })
                        })
    
                        videos_list.appendChild(video_e)
                    }
    
                    if (videos_list.lastChild) videos_list.lastChild.style.borderBottom = "none"
                }

                search_timer = null
            })
            .catch(err => {
                console.log("yt_search: error fetching", err)
            })
        }, 500)
    })

    return modal
}

export default Playlist
