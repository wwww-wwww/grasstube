import { spawnFFmpegWorker } from "./bundle.js"
import mkv from "./ebml"

function get_vint(dv, start) {
  let count = 0
  for (count = 0; count < dv.byteLength - start; count++) {
    if ((dv.getUint8(start + Math.floor(count / 8)) << count) & 0b10000000) break
  }

  let val = 0
  for (let i = 0; i < count + 1; i++) {
    val = (val << 8) + dv.getUint8(start + i)
  }
  val = val & (~(0b1 << (8 * (count + 1)) >>> (count + 1)))

  return { length: count + 1, value: val }
}

function get_atom_head(dv, start, header) {
  if (dv.getUint8(start).toString(16) != header) {
    console.log(`expecting ${header}, got`, dv.getUint8(start).toString(16))
    return null
  }

  const value = get_vint(dv, start + header.length / 2)
  return { length: header.length / 2 + value.length, value: value.value }
}

function get_atom_n(dv, start, header) {
  const head = get_atom_head(dv, start, header)
  const value = get_nint(dv, start + head.length, head.value)
  return { length: head.length + head.value, value: value }
}

function get_nint(dv, start, length) {
  let val = 0
  for (let i = 0; i < length; i++)
    val = (val << 8) + dv.getUint8(start + i)
  return val
}

class Stream {
  buffer_file = []

  video_element

  mediaSource
  audioSourceBuffer
  videoSourceBuffer

  ffmpeg
  ffmpeg_worker

  ready = false
  on_ready = null
  load_when_ready = null

  cues = []

  constructor() {
    this.init()
  }

  async init() {
    this.ffmpeg_worker = spawnFFmpegWorker()
    if (!(await this.ffmpeg_worker.isLoaded())) {
      console.log("Starting ffmpeg worker")
      await this.ffmpeg_worker.load()
      console.log("Loaded ffmpeg worker")
    }
    this.ready = true
    if (this.on_ready) this.on_ready()
    if (this.load_when_ready) this.load_file(this.load_when_ready)
  }

  check_range(start, end) {
    const starts = this.buffer_file.filter(r => start >= r[0] && start <= r[1])
    if (starts.length > 0) start = starts[0][1] + 1

    const ends = this.buffer_file.filter(r => end >= r[0] && end <= r[1])
    if (ends.length > 0) end = ends[0][0] - 1

    if (start > end) return false
    return [start, end]
  }

  async download_chunk(url, start, end) {
    end -= 1
    const new_range = this.check_range(start, end)
    if (!new_range) {
      console.log("already downloaded", start, end)
      return
    }
    [start, end] = new_range
    console.log("downloading", start, end)
    return await fetch(url, { headers: { "range": `bytes=${start}-${end}` } })
      .then(r => r.arrayBuffer())
      .then(buf => new Uint8Array(buf))
      .then(async arr => {
        end = start + arr.length
        this.buffer_file.push([start, end])
        await this.ffmpeg_worker.writeData(arr, start)
        return { data: arr, end: end }
      })
  }

  async download_head(url) {
    const content_length = await fetch(url, { method: "HEAD" })
      .then(res => res.headers.get("content-length"))

    let info = null

    let start = 0
    do {
      const res = await this.download_chunk(url, start, start + 65536)
      start = res.end
      const arr = await this.ffmpeg_worker.getInputData()
      info = await mkv(arr)
    } while (start < content_length && (info == null || !info.have_cluster || info.segment == null))

    if (info == null || !info.have_cluster || info.segment == null)
      throw "failed to download"

    return info
  }

  async download_cues(info, url) {
    const timestampScale = info.timestampScale.value / 1000000 / 1000

    const segment_start = info.segment.start + info.segment.next

    const seek_entries = info.seek_head.children
      .map(a => { return { id: a.children[0].value, position: a.children[1].value } })
      .sort((a, b) => a.position > b.position)
    const cues_index = seek_entries.findIndex(e => e.id == "1C53BB6B")
    const cues_position = segment_start + seek_entries[cues_index].position
    const cues_end = cues_index < seek_entries.length ?
      segment_start + seek_entries[cues_index + 1].position :
      info.segment.dataSize + info.segment.start + info.segment.next

    const cues = []
    console.log(cues_position, cues_end)

    const cues_data = new Uint8Array(cues_end - cues_position)

    let start = cues_position
    do {
      const lim = Math.min(start + 65536, cues_end)
      const res = await this.download_chunk(url, start, lim)
      cues_data.set(res.data, start - cues_position)
      start = res.end
    } while (start < cues_end)

    const cues_dataview = new DataView(cues_data.buffer)
    const header = [...Array(4).keys()].reduce((acc, i) => acc + cues_dataview.getUint8(i).toString(16), "")
    if (header != "1c53bb6b") {
      console.log("cues are not in the right spot?")
      return null
    }

    const cues_size = get_vint(cues_dataview, 4)
    const cues_body_position = 4 + cues_size.length
    let offset = cues_body_position
    while (offset < cues_size.value) {
      const cuepoint = get_atom_head(cues_dataview, offset, "bb")
      if (cuepoint == null) return
      const next = offset + cuepoint.length + cuepoint.value
      offset += cuepoint.length

      const cue_time = get_atom_n(cues_dataview, offset, "b3")
      if (cue_time == null) return
      offset += cue_time.length

      const cue_track_pos = get_atom_head(cues_dataview, offset, "b7")
      if (cue_track_pos == null) return
      offset += cue_track_pos.length

      const cue_track = get_atom_n(cues_dataview, offset, "f7")
      if (cue_track == null) return
      offset += cue_track.length

      const cue_cluster_pos = get_atom_n(cues_dataview, offset, "f1")
      if (cue_cluster_pos == null) return
      offset += cue_cluster_pos.length
      offset = next

      cues.push({ time: cue_time.value * timestampScale, position: segment_start + cue_cluster_pos.value })
    }

    return cues
  }

  async load_file(url) {
    console.log("load_file", url)
    if (!this.ready) {
      this.load_when_ready = url
      return
    }

    this.buffer_file = []
    await this.ffmpeg_worker.reset()

    const info = await this.download_head(url)
    if (info == null) return
    console.log("info", info)

    console.log(await this.ffmpeg_worker.consumeMetadata())
    console.log(await this.ffmpeg_worker.getMetadata())

    console.log("downloading cues")
    this.cues = await this.download_cues(info, url)
    console.log("cues", this.cues)

    /*const res = await this.download_chunk(url, this.cues[32].position, this.cues[35].position)

    console.log("extracting subs", res.data)
    await this.ffmpeg_worker.runFFmpeg(
      "-ss", this.cues[32].time.toString(),
      "-to", this.cues[36].time.toString(),
      "-copyts",
      "-i", "input.mkv",
      "-map", "0:2",
      "-scodec", "copy",
      "-movflags", "frag_keyframe+delay_moov+default_base_moof",
      "out.ass")
    const FS = this.ffmpeg_worker.ffmpegCore.FS

    const subtitle_track = await FS.readFile("out.ass")
    console.log(new TextDecoder().decode(subtitle_track))
    FS.unlink("out.ass")
    */
  }
}

export default Stream
