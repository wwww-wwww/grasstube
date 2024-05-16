function keydown(e) {
  const chat_open = !view_chat.classList.contains("hidden")
  if (e.target.tagName == "INPUT" && e.target != chat_input) return
  let nothing = false

  if (e.key == "b" && !chat_open) {
    window.__chat.send(":booba:")
  } else if (e.key == "z" && !chat_open) {
    window.__chat.send(":zawa:")
  } else if (e.key == "t" && !chat_open) {
    window.__chat.send(":takt:")
  } else if (e.key == "s" && !chat_open) {
    window.__chat.send(":smoge:")
  } else if (e.key == "S" && !chat_open) {
    window.__chat.send(":starege:")
  } else if (e.key == "w" && !chat_open) {
    window.__chat.send(":weirdge:")
  } else if (e.key == "m" && !chat_open) {
    window.__chat.send(":madge:")
  } else if (e.key == "p" && !chat_open) {
    window.__chat.send(":pog:")
  } else if (e.key == "u" && !chat_open) {
    window.__chat.send(":green:")
  } else if (e.key == "g" && !chat_open) {
    window.__chat.send(":gayge:")
  } else if (e.key == "k" && !chat_open) {
    window.__chat.send("/!kino")
  } else if (e.key == "y" && !chat_open) {
    window.__chat.send(":yuri:")
  } else if (e.key == "Y" && !chat_open) {
    window.__chat.send("/!r:yuri:")
  } else {
    nothing = true
  }

  if (!nothing) e.preventDefault()
}

function anilist_search(title, fn) {
  const query = `
query ($title: String) {
  Media (search: $title, type: ANIME) {
    siteUrl
    title {
      romaji
    }
    characters {
      edges {
        role
        node {
          image {
            medium
          }
          name {
            full
          }
        }
        voiceActors {
          siteUrl
          name {
            full
          }
          image {
            medium
          }
        }
      }
    }
  }
}
`

  const variables = {
    title: title
  }

  fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      query: query,
      variables: variables
    })
  })
    .then(resp => resp.json())
    .then(fn)
}


return {
  load: (_view) => {
    const style = document.createElement("style")
    style.innerHTML = `.bullet-r {
      font-size: 2em;
      font-weight: bolder;
      font-family: Arial, Helvetica, sans-serif;
      text-align: right;
      right: 0%;
      transform: translateX(100%);
      position: absolute;
      animation: flyright 5s linear;
      white-space: nowrap;
      color: white;
      opacity: 0.8;
      -webkit-text-stroke: 1px black;
    
      right: 0%;
      transform: translateX(100%);
    
      > img {
        max-height: 4em;
      }
    }

    @keyframes flyright {
      from {
        right: 100%;
        transform: translateX(0%);
      }

      to {
        right: 0%;
        transform: translateX(100%);
      }
    }

    .anilist {
      right: 0;
      top: 0;
      position: absolute;
      z-index: 100;
      opacity: 0;
      overflow-y: scroll;
      background: rgba(0, 0, 0, 0.5);
      height: 100%;
    }

    .anilist:hover {
      opacity: 1;
    }

    .anilist > a {
      display: block;
      padding: 0.5em;
    }

    .anilist > div {
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      padding: 0.5em;
    }

    .anilist > div > div {
      display: flex;
      gap: 0.5em;
    }

    .anilist img {
      width: 4em;
    }

    .anilist .left {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 0.25em 0;
      width: 8em;
    }

    .anilist .right {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 0.25em 0;
      width: 8em;
      text-align: right;
    }
    `

    document.getElementsByTagName("head")[0].appendChild(style)

    document.addEventListener("keydown", keydown)

    this.last_video = null
    this.anilist = create_element(maincontent, "div", "anilist")
    this.anilist.e_title = create_element(this.anilist, "a")
    this.anilist.e_content = create_element(this.anilist, "div")
  },
  unload: () => {
    document.removeEventListener("keydown", keydown)
    if (this.anilist.parentElement == maincontent)
      maincontent.removeChild(this.anilist)
  },
  on_set_video: data => {
    if (this.last_video == data["title"]) return
    this.last_video = data["title"]

    while (this.anilist.e_content.firstChild) this.anilist.e_content.removeChild(this.anilist.e_content.firstChild)

    this.anilist.e_title.removeAttribute("href")
    this.anilist.e_title.textContent = data["title"]

    if (!data["title"]) return

    let title = decodeURIComponent(data["title"])
    if (title.lastIndexOf(".") != -1)
      title = title.substring(0, title.lastIndexOf("."))
    title = title
      .substring(title.lastIndexOf("/") + 1)
      .replaceAll(/\[.+?\]/g, "")
      .replaceAll(/\(.+?\)/g, "")
      .replaceAll(/- *[0-9]+/g, "")
      .replaceAll("  ", " ")
      .trim()

    anilist_search(title, j => {
      if (j.errors && j.errors.length > 0) return
      this.anilist.e_title.textContent = j.data.Media.title.romaji
      this.anilist.e_title.href = j.data.Media.siteUrl

      for (const edge of j.data.Media.characters.edges) {
        const e = create_element(this.anilist.e_content, "div")
        const image = create_element(e, "img")
        const left = create_element(e, "div", "left")
        const name = create_element(left, "span", "name")
        const role = create_element(left, "span", "role")
        const right = create_element(e, "div", "right")
        const staff = create_element(right, "a", "staff")
        const staff_image_href = create_element(e, "a")
        const staff_image = create_element(staff_image_href, "img")

        role.textContent = edge.role
        name.textContent = edge.node.name.full
        image.src = edge.node.image.medium
        if (edge.voiceActors.length > 0) {
          staff.textContent = edge.voiceActors[0].name.full
          staff.href = edge.voiceActors[0].siteUrl
          staff_image.src = edge.voiceActors[0].image.medium
          staff_image_href.href = edge.voiceActors[0].siteUrl
        }
      }

    })
  },
  on_message: data => {
    if (data.content.startsWith("/!r")) {
      data.content = data.content.substr(3)
      const e = create_element(chat_danmaku, "div", "bullet-r")
      e.innerHTML = data.content
      e.style.top = `${Math.random() * 90}%`
      setTimeout(() => chat_danmaku.removeChild(e), 5000)

      if (data.content.toLowerCase() != data.content &&
        data.content.toUpperCase() == data.content) {
        e.classList.toggle("shake", true)
      }

      return 1
    }

    if (data.content == "/!kino") {
      const top = document.createElement("div")
      const bottom = document.createElement("div")

      top.style.position = "absolute"
      top.style.top = "0"
      top.style.width = "100%"
      top.style.background = "black"
      top.style.transition = "height 2s cubic-bezier(0.33, 1, 0.68, 1)"

      bottom.style.position = "absolute"
      bottom.style.bottom = "0"
      bottom.style.width = "100%"
      bottom.style.background = "black"
      bottom.style.transition = "height 2s cubic-bezier(0.33, 1, 0.68, 1)"
      top.style.height = "0%"
      bottom.style.height = "0%"

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          top.style.height = "13%"
          bottom.style.height = "13%"
        })
      })

      window.grassplayer.video.parentElement.insertBefore(top, window.grassplayer.video.nextSibling)
      window.grassplayer.video.parentElement.insertBefore(bottom, window.grassplayer.video.nextSibling)

      setTimeout(() => {
        top.parentElement.removeChild(top)
        bottom.parentElement.removeChild(bottom)
      }, 5000)

      setTimeout(() => {
        top.style.height = "0%"
        bottom.style.height = "0%"
      }, 3000)
      return 2
    }

    return 0
  }
}
