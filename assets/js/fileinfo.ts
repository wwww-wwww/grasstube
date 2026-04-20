import { ViewHook } from "phoenix_live_view"

export default class fileinfo extends ViewHook {
    mounted() {
        const e_title: HTMLAnchorElement = this.el.querySelector(".title")!
        const e_info = this.el.querySelector(".info")!

        this.handleEvent("video_set", data => {
            console.log("fileinfo:video_set", data)
            const filename = decodeURIComponent(new URL(data.video_url).pathname.split("/").pop()!)
            const title = this.get_title(filename)
            e_title.textContent = title

            this.anilist_search(title).then(data => {
                if (data.errors && data.errors.length > 0) return
                e_title.textContent = data.data.Media.title.romaji
                e_title.href = data.data.Media.siteUrl

                while (e_info.firstChild) e_info.removeChild(e_info.firstChild)

                for (const edge of data.data.Media.characters.edges) {
                    const el = document.createElement("div")
                    e_info.appendChild(el)
                    el.innerHTML = `
                    <div>
                        <img class="role"></img>
                        <span class="role-name"></span>
                    </div>
                    <div>
                        <img class="staff"></img>
                        <a class="staff-name" target="_blank"></a>
                    </div>`

                    const role: HTMLImageElement = el.querySelector(".role")!
                    const role_name = el.querySelector(".role-name")!
                    role.src = edge.node.image.medium
                    role_name.textContent = edge.node.name.full

                    if (edge.voiceActors.length > 0) {
                        const staff: HTMLImageElement = el.querySelector(".staff")!
                        const staff_name: HTMLAnchorElement = el.querySelector(".staff-name")!
                        staff.src = edge.voiceActors[0].image.medium
                        staff_name.textContent = edge.voiceActors[0].name.full
                        staff_name.href = edge.voiceActors[0].siteUrl
                    }
                }
            })
        })
    }

    private get_title(filename: string) {
        let clean = filename.replace(/\.[^/.]+$/, "")

        if (/S\d+E\d+/i.test(clean)) {
            return clean
                .split(/S\d+E\d+/i)[0]
                .replace(/\./g, " ")
                .trim()
        }

        clean = clean.replace(/^\[.*?\]\s*/, "")
        clean = clean.split(/\s-\s|\s\[/)[0]

        return clean.trim()
    }

    private async anilist_search(title: string) {
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

        const variables = { title: title }

        return fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query: query, variables: variables }),
        }).then(resp => resp.json())
    }
}
