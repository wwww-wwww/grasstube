import { finalizer, transfer } from 'abslink'
import { expose } from 'abslink/w3c'
import { queryRemoteFonts } from 'lfa-ponyfill'

import WASM from '../wasm/jassub-worker.js'

import { Canvas2DRenderer } from './renderers/2d-renderer.ts'
import { WebGL1Renderer } from './renderers/webgl1-renderer.ts'
import { WebGL2Renderer } from './renderers/webgl2-renderer.ts'
import { _fetch, fetchtext, LIBASS_YCBCR_MAP, THREAD_COUNT, WEIGHT_MAP, type ASSEvent, type ASSImage, type ASSStyle, type WeightValue } from './util.ts'

import type { JASSUB, MainModule } from '../wasm/types.d.ts'
// import { WebGPURenderer } from './webgpu-renderer'

declare const self: DedicatedWorkerGlobalScope &
  typeof globalThis & {
    HEAPU8RAW: Uint8Array<ArrayBuffer>
    WASMMEMORY: WebAssembly.Memory
  }

interface opts {
  wasmUrl: string
  width: number
  height: number
  subUrl: string | undefined
  subContent: string | null
  fonts: Array<string | Uint8Array>
  // A list is every face of one family, loaded together.
  availableFonts: Record<string, Uint8Array | string | string[]>
  defaultFont: string
  debug: boolean
  libassMemoryLimit: number
  libassGlyphLimit: number
  queryFonts: 'local' | 'localandremote' | false
}

export interface ImageFrame {
  count: number
  atlas: Uint8Array | null
  instances: Float32Array | null
  width: number
  height: number
}

export interface RenderedImages {
  frames: Array<ImageFrame | undefined>
  subtitleColorSpace: 'BT601' | 'BT709' | 'SMPTE240M' | 'FCC' | null
  videoColorSpace: 'BT709' | 'BT601' | null
}

const constructor = Symbol.for('constructor')

export class ASSRenderer {
  _wasm!: JASSUB
  _subtitleColorSpace?: 'BT601' | 'BT709' | 'SMPTE240M' | 'FCC' | null
  _videoColorSpace?: 'BT709' | 'BT601'
  _malloc!: (size: number) => number
  _gpurender!: WebGL2Renderer | WebGL1Renderer | Canvas2DRenderer

  debug = false

  constructor (...args: [data: opts, getFont: (font: string, weight: WeightValue) => Promise<Uint8Array<ArrayBuffer> | undefined>, ctrl: OffscreenCanvas, onFontsChanged?: () => void]) {
    return this[constructor](...args) as unknown as this
  }

  async [constructor] (data: opts, getFont: (font: string, weight: WeightValue) => Promise<Uint8Array<ArrayBuffer> | undefined>, ctrl: OffscreenCanvas, onFontsChanged?: () => void) {
    // remove case sensitivity
    this._availableFonts = Object.fromEntries(Object.entries(data.availableFonts).map(([k, v]) => [k.trim().toLowerCase(), v]))
    this.debug = data.debug
    this.queryFonts = data.queryFonts
    this._getFont = getFont
    this._onFontsChanged = onFontsChanged
    this._defaultFont = data.defaultFont.trim().toLowerCase()

    // hack, we want custom WASM URLs
    const _fetch = globalThis.fetch
    globalThis.fetch = _ => _fetch(data.wasmUrl)

    // const devicePromise = navigator.gpu?.requestAdapter({
    //   powerPreference: 'high-performance'
    // }).then(adapter => adapter?.requestDevice())
    // WebGL2 is barely faster than WebGL1 in most cases,
    // in rare cases the better texture-dedupe, drawing everything in one call, no fake stride and no page ordering
    // can help it's performance, but those cases are rare
    try {
      const testCanvas = new OffscreenCanvas(1, 1)
      if (testCanvas.getContext('webgl2')) {
        this._gpurender = new WebGL2Renderer(ctrl)
      } else {
        this._gpurender = testCanvas.getContext('webgl')?.getExtension('ANGLE_instanced_arrays') ? new WebGL1Renderer(ctrl) : new Canvas2DRenderer(ctrl)
      }
    } catch {
      this._gpurender = new Canvas2DRenderer(ctrl)
    }

    this._loadedInitialFonts = !data.fonts.length
    // Emscripten pre-spawns pthread workers from this pool size.
    // A pool size of 0 pre-spawns no workers.
    // libass reads 0 as auto, but emscripten does not.
    // THREAD_COUNT is 1 when rendering is serial. Pass 0 in that case.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { _malloc, JASSUB } = await (WASM({ __url: data.wasmUrl, __poolSize: THREAD_COUNT > 1 ? THREAD_COUNT : 0, __out: (log: string) => this._log(log) }) as Promise<MainModule>)
    this._malloc = _malloc

    this._wasm = new JASSUB(data.width, data.height, this._defaultFont)
    this._wasm.setThreads(THREAD_COUNT)

    if (!this._loadedInitialFonts) await this._loadInitialFonts(data.fonts)

    this._wasm.createTrackMem(data.subContent ?? await fetchtext(data.subUrl!))

    this._subtitleColorSpace = LIBASS_YCBCR_MAP[this._wasm.trackColorSpace]

    if (data.libassMemoryLimit > 0 || data.libassGlyphLimit > 0) {
      this._wasm.setMemoryLimits(data.libassGlyphLimit || 0, data.libassMemoryLimit || 0)
    }
    this._checkColorSpace()

    return this
  }

  // this passes a string of track data to libass, be it styles, events etc, which it then processes and adds to the track
  // useful for streaming subtitles
  processData (events: string) {
    this._wasm.processData(events)
  }

  // processes a single subtitle packet with ReadOrder, timecode and duration
  // useful for streaming subtitles from Matroska-style demuxers
  processChunk (data: string, timecode: number, duration: number) {
    this._wasm.processChunk(data, timecode, duration)
  }

  createEvent (event: ASSEvent) {
    this._wasm.createEvent(event)
  }

  getEvents (): Array<Partial<ASSEvent>> {
    return this._wasm.getEvents()
  }

  setEvent (event: ASSEvent, index: number) {
    this._wasm.setEvent(index, event)
  }

  removeEvent (index: number) {
    this._wasm.removeEvent(index)
  }

  createStyle (style: ASSStyle) {
    this._wasm.createStyle(style)
  }

  getStyles (): ASSStyle[] {
    return this._wasm.getStyles()
  }

  setStyle (style: ASSStyle, index: number) {
    this._wasm.setStyle(index, style)
  }

  removeStyle (index: number) {
    this._wasm.removeStyle(index)
  }

  styleOverride (style: ASSStyle) {
    this._wasm.styleOverride(style)
  }

  disableStyleOverride () {
    this._wasm.disableStyleOverride()
  }

  setTrack (content: string) {
    this._wasm.createTrackMem(content)

    this._subtitleColorSpace = LIBASS_YCBCR_MAP[this._wasm.trackColorSpace]!
  }

  freeTrack () {
    this._wasm.removeTrack()
  }

  async setTrackByUrl (url: string) {
    this.setTrack(await fetchtext(url))
  }

  _checkColorSpace () {
    if (!this._subtitleColorSpace || !this._videoColorSpace) return
    this._gpurender.setColorMatrix(this._subtitleColorSpace, this._videoColorSpace)
  }

  _defaultFont!: string
  setDefaultFont (fontName: string) {
    this._defaultFont = fontName.trim().toLowerCase()
    this._wasm.setDefaultFont(this._defaultFont)
  }

  async _log (log: string) {
    console.debug(log)
    const match = log.match(/JASSUB: fontselect:[^(]+: \(([^,]*), (\d{1,4}), \d+\)/)
    if (match && !await this._findAvailableFont(match[1]!.trim().toLowerCase(), WEIGHT_MAP[Math.ceil(parseInt(match[2]!) / 100) - 1])) {
      await this._findAvailableFont(this._defaultFont)
    }
  }

  async addFonts (fontOrURLs: Array<Uint8Array | string>) {
    if (!fontOrURLs.length) return false
    const strings: string[] = []
    const uint8s: Uint8Array[] = []

    for (const fontOrURL of fontOrURLs) {
      if (typeof fontOrURL === 'string') {
        strings.push(fontOrURL)
      } else {
        uint8s.push(fontOrURL)
      }
    }
    if (uint8s.length) this._allocFonts(uint8s)

    // this isn't batched like uint8s because software like jellyfin exists, which loads 50+ fonts over the network which takes time...
    // is connection exhaustion a concern here?
    return !!await Promise.allSettled(strings.map(url => this._asyncWrite(url)))
  }

  // we don't want to run _findAvailableFont before initial fonts are loaded
  // because it could duplicate fonts
  _loadedInitialFonts = false
  async _loadInitialFonts (fontOrURLs: Array<Uint8Array | string>) {
    await this.addFonts(fontOrURLs)
    this._loadedInitialFonts = true
    this._wasm.reloadFonts()
  }

  _getFont!: (font: string, weight: WeightValue) => Promise<Uint8Array<ArrayBuffer> | undefined>
  _availableFonts: Record<string, Uint8Array | string | string[]> = {}
  _checkedFonts = new Set<string>()
  async _findAvailableFont (fontName: string, weight?: WeightValue) {
    if (!this._loadedInitialFonts) return

    // Roboto Medium, null -> Roboto, Medium
    // Roboto Medium, Medium -> Roboto, Medium
    // Roboto, null -> Roboto, Regular
    // italic is not handled I guess
    for (const _weight of WEIGHT_MAP) {
      // check if fontname has this weight name in it, if yes remove it
      if (fontName.includes(_weight)) {
        fontName = fontName.replace(_weight, '').trim()
        weight ??= _weight
        break
      }
    }

    weight ??= 'regular'

    const key = fontName + ' ' + weight
    // a whole family covers every weight
    if (this._checkedFonts.has(key) || this._checkedFonts.has(fontName)) return
    this._checkedFonts.add(key)

    try {
      const font = this._availableFonts[key] ?? this._availableFonts[fontName] ?? await this._queryLocalFont(fontName, weight) ?? await this._queryRemoteFont([key, fontName])
      if (Array.isArray(font)) {
        this._checkedFonts.add(fontName)
        return await this.addFonts(font)
      }
      if (font) return await this.addFonts([font])
    } catch (e) {
      console.warn('Error querying font', fontName, weight, e)
    }
  }

  queryFonts!: 'local' | 'localandremote' | false
  async _queryLocalFont (fontName: string, weight: WeightValue) {
    if (!this.queryFonts) return
    return await this._getFont(fontName, weight)
  }

  async _queryRemoteFont (postscriptNames: string[]) {
    if (this.queryFonts !== 'localandremote') return

    const fontData = await queryRemoteFonts({ postscriptNames })
    if (!fontData.length) return
    const blob = await fontData[0]!.blob()
    return new Uint8Array(await blob.arrayBuffer())
  }

  async _asyncWrite (font: string) {
    const res = await _fetch(font)
    this._allocFonts([new Uint8Array(await res.arrayBuffer())])
  }

  _fontId = 0
  _onFontsChanged?: () => void
  _allocFonts (uint8s: Uint8Array[]) {
    for (const uint8 of uint8s) {
      const ptr = this._malloc(uint8.byteLength)
      self.HEAPU8RAW.set(uint8, ptr)
      this._wasm.addFont('font-' + (this._fontId++), ptr, uint8.byteLength)
    }
    this._wasm.reloadFonts()
    // On-demand fonts arrive after libass already fell back; let the main thread redraw.
    if (this._loadedInitialFonts) this._onFontsChanged?.()
  }

  _resizeCanvas (width: number, height: number, videoWidth: number, videoHeight: number) {
    this._wasm.resizeCanvas(width, height, videoWidth, videoHeight)
    this._gpurender.resizeCanvas(width, height)
  }

  async [finalizer] () {
    this._wasm.quitLibrary()
    this._gpurender.destroy()
    // @ts-expect-error force GC
    this._wasm = null
    // @ts-expect-error force GC
    this._gpurender = null
    this._availableFonts = {}
  }

  _draw (time: number, repaint = false) {
    const images = this._wasm.rawRender(time, Number(repaint)) as ASSImage[] | null
    if (!images) return

    this._gpurender.render(images, self.HEAPU8RAW)
  }

  _imagesSize?: [number, number, number, number]
  // manualPresent: libass's masks for each of `times` in one atlas, plus 12 floats per mask
  // (dest x, y, w, h | atlas x, y, 0, 0 | r, g, b, opacity). Undefined: same as previous render.
  _renderImages (times: number[], width: number, height: number, videoWidth: number, videoHeight: number, repaint = false): RenderedImages {
    const size = this._imagesSize
    if (!size || size[0] !== width || size[1] !== height || size[2] !== videoWidth || size[3] !== videoHeight) {
      this._imagesSize = [width, height, videoWidth, videoHeight]
      this._wasm.resizeCanvas(width, height, videoWidth, videoHeight)
      repaint = true
    }

    const frames: Array<ImageFrame | undefined> = []
    const transfers: Transferable[] = []
    for (const time of times) {
      const images = this._wasm.rawRender(time, Number(repaint)) as ASSImage[] | null
      repaint = false
      if (!images) {
        frames.push(undefined)
        continue
      }
      const frame = this._packImages(images)
      frames.push(frame)
      if (frame.count) transfers.push(frame.atlas!.buffer, frame.instances!.buffer)
    }

    return transfer({ frames, subtitleColorSpace: this._subtitleColorSpace ?? null, videoColorSpace: this._videoColorSpace ?? null }, transfers)
  }

  _packImages (images: ASSImage[]): ImageFrame {
    const heap = self.HEAPU8RAW

    // Same cache_id, bitmap and size means the same pixels: one atlas slot.
    // source[i] is the image whose slot image i uses.
    const valid: ASSImage[] = []
    const source: number[] = []
    const seen = new Map<string, number>()
    let maxW = 0
    let area = 0
    for (const img of images) {
      if (img.w <= 0 || img.h <= 0) continue
      const i = valid.length
      valid.push(img)

      const key = img.cache_id ? `${img.cache_id}:${img.bitmap}:${img.w}:${img.h}:${img.stride}` : ''
      const first = key ? seen.get(key) : undefined
      if (first !== undefined) {
        source.push(first)
        continue
      }
      if (key) seen.set(key, i)
      source.push(i)
      area += img.w * img.h
      if (img.w > maxW) maxW = img.w
    }

    const count = valid.length
    if (!count) return { count: 0, atlas: null, instances: null, width: 0, height: 0 }

    // shelf packing, roughly square so full-frame masks don't exceed texture size limits
    const atlasW = Math.max(maxW, Math.min(8192, Math.ceil(Math.sqrt(area * 1.25))))
    const instances = new Float32Array(count * 12)
    let x = 0
    let y = 0
    let rowH = 0
    for (let i = 0; i < count; i++) {
      const img = valid[i]!
      const o = i * 12
      const s = source[i]!
      if (s === i) {
        if (x + img.w > atlasW) {
          x = 0
          y += rowH
          rowH = 0
        }
        instances[o + 4] = x
        instances[o + 5] = y
        x += img.w
        if (img.h > rowH) rowH = img.h
      } else {
        instances[o + 4] = instances[s * 12 + 4]!
        instances[o + 5] = instances[s * 12 + 5]!
      }

      const c = img.color
      instances[o] = img.dst_x
      instances[o + 1] = img.dst_y
      instances[o + 2] = img.w
      instances[o + 3] = img.h
      instances[o + 8] = ((c >>> 24) & 0xFF) / 255
      instances[o + 9] = ((c >>> 16) & 0xFF) / 255
      instances[o + 10] = ((c >>> 8) & 0xFF) / 255
      // libass alpha: 0 = opaque
      instances[o + 11] = 1 - (c & 0xFF) / 255
    }

    const atlasH = y + rowH
    const atlas = new Uint8Array(atlasW * atlasH)
    for (let i = 0; i < count; i++) {
      if (source[i] !== i) continue
      const img = valid[i]!
      const ax = instances[i * 12 + 4]!
      const ay = instances[i * 12 + 5]!
      for (let r = 0; r < img.h; r++) {
        const src = img.bitmap + r * img.stride
        atlas.set(heap.subarray(src, src + img.w), (ay + r) * atlasW + ax)
      }
    }

    return { count, atlas, instances, width: atlasW, height: atlasH }
  }

  // single-frame readback for tests
  _drawCapture (time: number) {
    const images = (this._wasm.rawRender(time, 1) ?? []) as ASSImage[]
    this._gpurender.render(images, self.HEAPU8RAW)

    const canvas = this._gpurender.canvas
    if (!canvas) return
    const { width, height } = canvas
    const surface = new OffscreenCanvas(width, height)
    const ctx = surface.getContext('2d')
    if (!ctx) return
    ctx.drawImage(canvas, 0, 0)
    return { data: ctx.getImageData(0, 0, width, height).data, width, height }
  }

  _setColorSpace (videoColorSpace: 'RGB' | 'BT709' | 'BT601') {
    if (videoColorSpace === 'RGB') return
    this._videoColorSpace = videoColorSpace
    this._checkColorSpace()
  }
}

if (self.name === 'jassub-worker') {
  expose(ASSRenderer)
}
