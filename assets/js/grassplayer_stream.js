import spawnFFmpegWorker from "./bundle.js"
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
  if (!header.match(/.{2}/g).every((e, i) => dv.getUint8(start + i).toString(16) == e)) {
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
  buffer_remux = []

  video_element
  url

  media_source
  audio_source_buffer
  video_source_buffer

  ffmpeg_worker
  metadata

  ready = false
  on_ready = null
  load_when_ready = null

  cues = []

  downloader = null
  downloader_next = null

  remuxer = null
  remuxer_queue = []

  constructor(video_element) {
    if (!window.MediaSource) {
      const err = "Media Source Extensions are not supported by this browser."
      alert(err)
      throw new Error(err)
    }

    this.video_element = video_element
    this.media_source = new MediaSource()

    this.init()
  }

  async init() {
    console.log("Starting ffmpeg worker")
    this.ffmpeg_worker = spawnFFmpegWorker()
    //if (!(await this.ffmpeg_worker.isLoaded())) {
    //  await this.ffmpeg_worker.load()
    //  console.log("Loaded ffmpeg worker")
    //}
    this.ready = true
    if (this.on_ready) this.on_ready()
    if (this.load_when_ready) this.load_file(this.load_when_ready)
  }

  check_range(start, end, arr, offset = 0) {
    const starts = arr.filter(r => start >= r[0] && start <= r[1])
    if (starts.length > 0) start = starts[0][1] + offset

    const ends = arr.filter(r => end >= r[0] && end <= r[1])
    if (ends.length > 0) end = ends[0][0] - offset

    if (starts[0] != null && starts[0] == ends[0]) return false
    if (start >= end) return false
    return [start, end]
  }

  async download_chunk(url, start, end, store = true) {
    end -= 1
    const new_range = this.check_range(start, end, this.buffer_file, 1)
    if (!new_range) {
      console.log("already downloaded", start, end)
      return false
    }
    [start, end] = new_range
    console.log("downloading", start, end)
    return await fetch(url, { headers: { "range": `bytes=${start}-${end}` } })
      .then(r => r.arrayBuffer())
      .then(buf => new Uint8Array(buf))
      .then(async arr => {
        end = start + arr.length

        if (store) {
          let buffer_e = this.buffer_file.filter(e => e[1] + 1 == start).at(0)
          if (buffer_e) buffer_e[1] = Math.max(buffer_e[1], end)

          let buffer_s = this.buffer_file.filter(e => e[0] - 1 == end).at(0)
          if (buffer_s) buffer_s[0] = Math.max(buffer_s[0], start)

          if (!buffer_e && !buffer_s) this.buffer_file.push([start, end])

          console.log("buf_file", this.buffer_file)

          const buf = await this.ffmpeg_worker.writeData(arr, start)

          return { data: buf, end: end }
        }

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
      console.log(arr)
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

    const res = await this.download_chunk(url, cues_position, Math.min(cues_position + 65536, cues_end), false)
    const cues_data = res.data.subarray(cues_position)

    const cues_dataview = new DataView(cues_data.buffer, 0)
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
    this.url = url
    console.log("load_file", url)
    if (!this.ready) {
      this.load_when_ready = url
      return
    }

    this.video_element.src = URL.createObjectURL(this.media_source)
    this.media_source.addEventListener("sourceopen", () => {
      URL.revokeObjectURL(this.video_element.src)
    }, { once: true })

    this.buffer_file = []
    await this.ffmpeg_worker.reset()

    const info = await this.download_head(url)
    if (info == null) return
    console.log("info", info)

    await this.ffmpeg_worker.consumeMetadata()
    this.metadata = await this.ffmpeg_worker.getMetadata()

    console.log("downloading cues")
    this.cues = await this.download_cues(info, url)
    console.log("cues", this.cues)

    /*
    const res = await this.download_chunk(url, this.cues[32].position, this.cues[35].position)
    const dataview = new DataView(res.data.buffer, this.cues[32].position, this.cues[35].position - this.cues[32].position)

    const start = 0
    while (start < dataview.byteLength) {

      break
    }*/


    if (this.media_source.readyState === "open") {
      console.log("sourceopen", this.metadata.durationSeconds)
      this.media_source.duration = this.metadata.durationSeconds
    } else if (this.media_source.readyState == "closed") {
      this.media_source.addEventListener("sourceopen", () => {
        console.log("sourceopen", this.metadata.durationSeconds)
        this.media_source.duration = this.metadata.durationSeconds
      }, { once: true });
    }

    this.video_element.dispatchEvent(new Event("timeupdate"))
    await this.download(0, 10)
    this.video_element.addEventListener("timeupdate", () => this.onTimeUpdate())
    //this.onTimeUpdate()
    /*
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


  async onTimeUpdate() {
    //console.log("timeupdate")
    const time = this.video_element.currentTime

    const getFirstUnbuffered = () => {
      const buffers = this.media_source.sourceBuffers
      let res = undefined

      for (let i = 0; i < buffers.length; i++) {
        let intersectingRangeEnd = undefined
        const bufferedRanges = buffers[i].buffered
        for (let j = 0; j < bufferedRanges.length; j++) {
          const start = bufferedRanges.start(j)
          const end = bufferedRanges.end(j)
          if (start <= time && time <= end) {
            intersectingRangeEnd = end
            break
          }
        }
        if (intersectingRangeEnd === undefined) {
          return time
        } else if (res === undefined) {
          res = intersectingRangeEnd
        } else {
          res = Math.min(res, intersectingRangeEnd)
        }
      }
      return res || time
    }

    const nextChunkTime = getFirstUnbuffered()
    if (nextChunkTime - time < 5.0) {
      this.download(nextChunkTime, nextChunkTime + 5)
    }
  }

  queue_download(cue_start, cue_end) {
    console.log("queue_dl", cue_start, cue_end)
    if (this.downloader) {
      this.downloader_next = [cue_start, cue_end]
      return
    }

    this.downloader = setTimeout(async () => {
      let to_download = [cue_start, cue_end]

      while (to_download) {
        await this.download_chunk(this.url, to_download[0].position, to_download[1].position + 1024)
        this.queue_remux(to_download[0].time, to_download[1].time)
        to_download = this.downloader_next
        this.downloader_next = null
      }
      this.downloader = null
    }, 0)
  }

  queue_remux(start, end) {
    const new_range = this.check_range(start, end, this.buffer_remux)
    if (!new_range) {
      console.log("already remuxed", start, end)
      return
    }

    [start, end] = new_range
    console.log("queue remux")

    if (this.remuxer_queue.filter(e => e[0] == start && e[1] == end).length > 0)
      return

    this.remuxer_queue.push([start, end])

    if (this.remuxer) return

    this.remuxer = setTimeout(async () => {
      while (this.remuxer_queue.length > 0) {
        [start, end] = this.remuxer_queue.shift()
        await this.loadChunk(start, end)
      }
      this.remuxer = null
    }, 0)

  }

  download(start, end) {
    let cue_start = this.cues.filter(e => start >= e.time).at(-2) || this.cues[0]
    let cue_end = this.cues.filter(e => end <= e.time).at(1) || this.cues.at(-1)

    const new_range = this.check_range(cue_start.position, cue_end.position - 1, this.buffer_file, 1)
    if (!new_range) {
      //console.log("already downloaded", start, end)
      this.queue_remux(cue_start.time, cue_end.time)
      return false
    }

    cue_start = this.cues.filter(e => new_range[0] >= e.position).at(-1) || this.cues[0]
    cue_end = this.cues.filter(e => new_range[1] <= e.position).at(0)

    this.queue_download(cue_start, cue_end)
  }

  async loadChunk(start, end) {
    console.log(this.buffer_remux)
    const new_range = this.check_range(start, end, this.buffer_remux)
    if (!new_range) {
      console.log("already remuxed", start, end)
      return
    }
    console.log(new_range)

    console.log(`Remuxing media segment with time range [${start} - ${end}]`)
    const remuxedChunk = await this.ffmpeg_worker.remuxChunk(start, end, this.metadata.videoStreams[0]?.id, this.metadata.audioStreams[0]?.id)
    console.log("remuxedchunk", remuxedChunk)
    //console.log(remuxedChunk)

    // TODO: loadChunk for updating buffers, not ready
    /*if (this.audio_source_buffer === undefined && remuxedChunk.audioChunk != null) {
      this.audio_source_buffer = this.media_source.addSourceBuffer(remuxedChunk.audioChunk.mime)
    }*/
    if (this.video_source_buffer === undefined && remuxedChunk.videoChunk != null) {
      this.video_source_buffer = this.media_source.addSourceBuffer(remuxedChunk.videoChunk.mime)
    }
    let updating = 0
    const cb = s => {
      const sizeMB = (s.data.length / (1 << 20)).toFixed(3)
      //console.log(`Added remuxed segment of type ${s.mime} with size ${sizeMB} MB to SourceBuffer`)
      if (--updating == 0) {
        this.updatingTime = undefined
      }
    }
    if (remuxedChunk.audioChunk) {
      updating++
      //  this.audio_source_buffer.appendBuffer(remuxedChunk.audioChunk.data)
      //  this.audio_source_buffer.addEventListener("updateend", () => cb(remuxedChunk.audioChunk), { once: true })
    }
    if (remuxedChunk.videoChunk) {
      updating++
      this.video_source_buffer.appendBuffer(remuxedChunk.videoChunk.data)
      this.video_source_buffer.addEventListener("updateend", () => cb(remuxedChunk.videoChunk), { once: true })
    }

    let buffer_e = this.buffer_remux.filter(e => e[1] == start).at(0)
    if (buffer_e) buffer_e[1] = Math.max(buffer_e[1], end)

    let buffer_s = this.buffer_remux.filter(e => e[0] == end).at(0)
    if (buffer_s) buffer_s[0] = Math.max(buffer_s[0], start)

    if (!buffer_e && !buffer_s) this.buffer_remux.push([start, end])

    console.log("buf_remux", this.buffer_remux)
  }

}

export default Stream
