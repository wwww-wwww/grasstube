import { create_element } from "./util"

function build_hosted_videos(hosted_videos_outer, media_directories, add, fill) {
  media_directories.forEach(directory => {
    if (directory.length == 0) return
    const dc = create_element(hosted_videos_outer, "div", "collapsed")
    const drow = create_element(dc, "div", "directory")

    const observer = new IntersectionObserver(
      ([e]) => e.target.classList.toggle("is-pinned", e.intersectionRatio < 1),
      { threshold: [1] }
    )

    observer.observe(drow)

    const btn_toggle = create_element(drow, "span", "")
    btn_toggle.textContent = directory

    const btn_refresh = create_element(drow, "button", "icon")
    btn_refresh.textContent = "refresh"

    const table_outer = create_element(dc, "div", "table_outer")
    const table = create_element(table_outer, "table")

    btn_toggle.addEventListener("click", () => dc.classList.toggle("collapsed"))

    async function refresh() {
      await scan(directory)
        .then(files => {
          while (table.firstChild) table.removeChild(table.firstChild)
          files = files.map(url => {
            return {
              path: url,
              filename: decodeURIComponent(url.split("\\").pop().split("/").pop())
            }
          })
          files
            .filter(x => video_exts.some(e => x.filename.toLowerCase().endsWith(e)))
            .map(video => {
              const sub_names = [
                video.filename + ".ass",
                pairroot(video.filename) + ".ass",
              ]

              const subs = files.filter(file => sub_names.some(x => file.filename == x))

              return {
                title: video.filename,
                path: video.path,
                filename: video.filename,
                subs: subs
              }
            })
            .forEach(video => {
              const row = create_element(table, "tr")
              const filename = create_element(row, "td")
              filename.textContent = video.title
              const subs = create_element(row, "td", "icon")
              subs.textContent = video.subs.length > 0 ? "check" : "close"
              const btns = create_element(row, "td")
              const btn_fill = create_element(btns, "button", "icon")
              btn_fill.textContent = "edit"
              btn_fill.addEventListener("click", () => fill(video.path, video.subs.length > 0 ? video.subs[0].path : "", {}))
              const btn_add = create_element(btns, "button", "icon")
              btn_add.textContent = "add"
              btn_add.addEventListener("click", () => add(video.path, video.subs.length > 0 ? video.subs[0].path : "", {}))
            })
        })
    }

    refresh()
    btn_refresh.addEventListener("click", () => {
      btn_refresh.disabled = true
      refresh().finally(() => {
        btn_refresh.disabled = false
      })
    })
  })
}

function pairroot(filename) {
  return filename.substr(0, filename.lastIndexOf("."))
}

const video_exts = [".mp4", ".webm"]
const dir_filter = ["thumb", "thumbs"]

async function scan(url, limit = 2) {
  if (limit == 0) return

  url = new URL(url)
  const files = []
  let folders = []
  await fetch(url).then(res => res.text())
    .then(t => {
      const doc = document.createElement("div")
      doc.innerHTML = t
      const urls = [...doc.getElementsByTagName("a")]
        .map(x => x.getAttribute("href"))
        .map(x => new URL(x, url).href)
        .filter(x => x.length > url.href.length)

      files.push(...urls.filter(x => !x.endsWith("/")))
      folders.push(...urls.filter(x => x.endsWith("/")))
    })

  folders = folders.filter(x => !dir_filter.some(e => new URL(x).pathname.split("/").at(-2).toLowerCase() == e))

  for (const folder of folders) {
    files.push(...await scan(folder, limit - 1))
  }

  return files
}

export default (view, media_directories) => {
  const hosted_videos_outer = create_element(playlist_tab1, "div", "hosted_videos_outer")

  build_hosted_videos(hosted_videos_outer, media_directories, (url, sub, alts) => {
    view.pushEvent("add", {
      title: "",
      url: url,
      sub: sub || "",
      alts: JSON.stringify(alts) || "{}"
    })
  }, (url, sub, alts) => {
    playlist_add_url.value = url
    playlist_add_sub.value = sub || ""
    playlist_add_small.value = JSON.stringify(alts) || "{}"
  })
}
