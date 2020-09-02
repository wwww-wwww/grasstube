import css from "../css/playlist.css"
import "phoenix_html"
import Modal from "./modals"
import build_hosted_videos from "./okea_hosted_videos" // OKEA ONLY
import {seconds_to_hms, unescape_html, create_element} from "./util"

class Playlist{
  constructor() {
    this.channel = null
    this.has_controls = false
    this.playlist = []
    this.current_video = -1
  
    playlist_add.addEventListener("click", () => {
      this.channel.push("q_add", {
        title: add_title.value,
        url: add_url.value,
        sub: add_sub.value,
        alts: add_small.value
      })
      add_title.value = ""
      add_url.value = ""
      add_sub.value = ""
      add_small.value = ""
    })

    let old_search = ""

    let search_timer = null
  
    yt_input.addEventListener("keyup", () => [search_timer, old_search] = yt_search(old_search, yt_input.value.trim(), search_timer, this.channel))

    const playlist_modal = new Modal()
    const tab1 = playlist_modal.create_tab("hosted")
    const tab2 = playlist_modal.create_tab("youtube")

    tab1.appendChild(playlist_tab1)
    tab2.appendChild(playlist_tab2)

    show_playlist_dialog.addEventListener("click", () => {
      playlist_modal.show()
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
      title: "",
      url: add_url.value,
      sub: add_sub.value,
      alts: "{}"
    })
  
    add_url.value = ""
    add_sub.value = ""
  }

  connect(socket) {
    console.log("playlist: connecting to room " + socket.room)
    this.channel = socket.channel("playlist:" + socket.room, {password: socket.password})

    this.channel.on("playlist", data => this.on_playlist(data))

    this.channel.on("current", data => this.on_current(data))
  
    this.channel.on("controls", _ => this.set_controls(true))
    this.channel.on("revoke_controls", _ => this.set_controls(false))

    return this.channel.join()
    .receive("ok", resp => {
      console.log("playlist: connected", resp) 
    })
    .receive("error", resp => {
      console.log("playlist: failed to connect", resp)
    })
  }

  set_controls(controls) {
    console.log("playlist: controls", controls)
    this.has_controls = controls
  
    playlist_controls.classList.toggle("hidden", !controls)

    this.playlist.forEach(vid => {
      vid.q_set.classList.toggle("hidden", !controls)
      vid.q_del.classList.toggle("hidden", !controls)
      vid.q_move.classList.toggle("hidden", !controls)
    })
  }

  on_current(data) {
    console.log("playlist: current", data)

    this.current_video = data.id
    this.playlist.forEach(vid => {
      vid.e.classList.toggle("isactive", this.current_video == vid.id)
    })

    let current_video = 0
    if (this.current_video != -1) {
      for (let i = 0; i < this.playlist.length; i++) {
        if (this.playlist[i].id == this.current_video) {
          current_video = i + 1
          break
        }
      }
    }
    playlist_header_count.textContent = `${current_video} / ${this.playlist.length}`
  }

  on_playlist(data) {
    console.log("playlist: playlist", data)
    this.playlist.length = 0
    while (playlist_container.firstChild) playlist_container.removeChild(playlist_container.firstChild)
    
    if (data.playlist.length <= 0) {
      playlist_header_count.textContent = "0 / 0"
      playlist_header_time.textContent = ""
    } else {
      let current_video = 0
      if (this.current_video != -1) {
        for (let i = 0; i < this.playlist.length; i++) {
          if (this.playlist[i].id == this.current_video) {
            current_video = i + 1
            break
          }
        }
      }

      playlist_header_count.textContent = `${current_video} / ${data.playlist.length}`

      let time = 0
      for (let i = 0; i < data.playlist.length; i++) {
        const vid = data.playlist[i]

        const e = create_element(playlist_container, "div", "playlist_item")

        vid.q_del = create_element(e, "button", "playlist_remove square")
        vid.q_del.textContent = "×"

        vid.title_e = create_element(e, "a", "playlist_item_title")
        
        vid.title_e.textContent = vid.title
        if (vid.url.length > 0) {
          vid.title_e.href = vid.url
        }
    
        if (vid.duration != "unset") {
          time += vid.duration
          vid.duration_e = create_element(e, "span", "playlist_item_duration")
          vid.duration_e.textContent = seconds_to_hms(vid.duration)
        }

        vid.q_set = create_element(e, "button", "playlist_set")
        vid.q_set.textContent = "set"

        vid.q_move = create_element(e, "button", "playlist_drag")
        vid.q_move.textContent = "☰"

        vid.q_move.addEventListener("mousedown", e => this.queue_start_drag(e))
        vid.q_move.addEventListener("touchstart", e => this.queue_start_drag(e))

        vid.q_set.addEventListener("click", e => this.queue_set(e))
        vid.q_del.addEventListener("click", e => this.queue_remove(e))
    
        vid.q_del.classList.toggle("hidden", !this.has_controls)
        vid.q_set.classList.toggle("hidden", !this.has_controls)
        vid.q_move.classList.toggle("hidden", !this.has_controls)
    
        e.classList.toggle("isactive", vid.id == this.current_video)

        vid.e = e
        this.playlist.push(vid)
      }
      playlist_header_time.textContent = seconds_to_hms(time)
    }
  }
}

function yt_search(old_search, new_search, search_timer, channel) {
  
  if (search_timer != null) clearTimeout(search_timer)

  return [setTimeout(() => {
    if (old_search == new_search) return
    
    old_search = new_search
    
    fetch(`/api/yt_search?query=${encodeURIComponent(new_search)}`)
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        while (yt_list.firstChild) yt_list.removeChild(yt_list.firstChild)

        for (const video of data.items) {
          const video_id = unescape_html(video.id)
          const video_url = `https://youtube.com/watch?v=${video_id}`

          const video_e = create_element(yt_list, "div", "yt-video")
          
          let column = create_element(video_e, "div")
          column.style.display = "flex"
          column.style.alignItems = "center"

          const video_e_thumbnail = create_element(column, "img")
          video_e_thumbnail.style.height = "6em"
          video_e_thumbnail.src = `https://img.youtube.com/vi/${video_id}/mqdefault.jpg`

          column = create_element(video_e, "div")
          column.style.padding = "0.5em"
          column.style.flex = "1"
          column.style.minWidth = "0"

          let row = create_element(column, "div")

          const video_e_title = create_element(row, "a")
          video_e_title.textContent = unescape_html(video.title)
          video_e_title.style.color = "rgba(255, 255, 255, 0.9)"
          video_e_title.href = video_url
          
          row = create_element(column, "div")

          const video_e_author = create_element(row, "a")
          video_e_author.textContent = unescape_html(video.channel_title)
          video_e_author.style.fontSize = "0.9em"
          video_e_author.href = `https://youtube.com/channel/${video.channel_id}`

          row = create_element(column, "div")
          
          const video_add = create_element(video_e, "button")
          video_add.textContent = "add"
          video_add.style.flex = "0"

          video_add.addEventListener("click", () => {
            channel.push("q_add", {
              title: "",
              url: video_url,
              sub: "",
              alts: "{}"
            })
          })
        }

        if (yt_list.lastChild) yt_list.lastChild.style.borderBottom = "none"
      }

      search_timer = null
    })
    .catch(err => {
      console.log("yt_search: error fetching", err)
    })
  }, 500), old_search]
}

export default Playlist
