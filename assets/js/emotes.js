const emotes = {}
let emotes_data = ""

function reload_emotes(room, modal, onclick, refresh = true, new_data = false) {
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
      emote_img.addEventListener("click", () => onclick(emote))
      modal_body.appendChild(emote_img)
    })
  }

  if (refresh) {
    fetch(`/api/emotes/r/${room}`, { headers: { "Content-Type": "application/json; charset=utf-8" } })
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          console.log("emotes: error", data)
          return
        }
        console.log("emotes: fetched")

        const new_data = JSON.stringify(data)
        if (emotes_data != new_data || modal_body.children.length == 0) {
          while (modal_body.firstChild) modal_body.removeChild(modal_body.firstChild)
          for (const emote in emotes) delete emotes[emote]
          data.emotes.forEach(emote => {
            emotes[emote["emote"]] = emote["url"]
          })
          reload_emotes(room, modal, onclick, false, true)
        }
        emotes_data = new_data
      })
      .catch(err => {
        console.log("emotes: error fetching", err)
      })
  }
}

export default reload_emotes
