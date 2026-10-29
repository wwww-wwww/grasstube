import JASSUB from "../jassub"
import type { ImageFrame, RenderedImages } from "../jassub/dist/worker/worker"
import { colorMatrixConversionMap } from "../jassub/dist/worker/renderers/webgpu-renderer.js"
import { Immediates } from "../effects/_immediates"

// Draws JASSUB's output in the same submit as the video frame with the same media time, so both
// reach the screen together; JASSUB's own canvas presents whenever its worker happens to finish.
//
// The worker returns libass's masks (an 8-bit atlas plus a position and colour per mask), not a
// composited bitmap: importing a bitmap from the worker's GPU context stalls the device queue.

interface Entry {
    time: number
    frame: ImageFrame
    // Rendered with fonts since replaced: a fallback only, never an exact match.
    stale?: boolean
}

// Predicted and actual rVFC media times differ only by float error.
const MATCH_EPSILON = 0.001
const PREBUFFER_SECONDS = 0.5
const MAX_PREBUFFER_FRAMES = 30
// A full-frame sign at 4K is ~8 MB of masks per frame.
const MAX_BUFFER_BYTES = 64 * 1024 * 1024
// For redraws and the fallback lookup.
const KEEP_BEHIND_SECONDS = 0.25
const BATCH = 4

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0])

const shader = (immediates: Immediates) => /* wgsl */ `${immediates.directive()}
struct Uniforms {
    color_matrix: mat3x3<f32>,
    resolution: vec2<f32>,
    lut_enabled: f32,
}

struct Instance {
    dest: vec4<f32>,  // x, y, w, h
    src: vec4<f32>,   // atlas x, y
    color: vec4<f32>, // r, g, b, opacity
}

${immediates.declare("u", "Uniforms")}
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(0) @binding(3) var lut: texture_3d<f32>;
@group(0) @binding(4) var lut_sampler: sampler;

// Must match EffectLut3d's mapping.
fn grade(rgb: vec3<f32>) -> vec3<f32> {
    if (u.lut_enabled == 0.0) {
        return rgb;
    }
    let size = f32(textureDimensions(lut).x);
    let limited = mix(vec3(16.0 / 255.0), vec3(235.0 / 255.0), clamp(rgb, vec3(0.0), vec3(1.0)));
    let coords = mix(vec3(0.5 / size), vec3(1.0 - 0.5 / size), limited);
    return textureSampleLevel(lut, lut_sampler, coords, 0.0).rgb;
}

struct VsOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) offset: vec2<f32>,
    @location(1) @interpolate(flat) color: vec4<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VsOut {
    let inst = instances[i];

    // Two triangles: (0,0) (1,0) (0,1) / (1,0) (1,1) (0,1)
    let corner = vec2<f32>(f32(v == 1u || v == 3u || v == 4u), f32(v == 2u || v == 4u || v == 5u));
    var clip = (inst.dest.xy + corner * inst.dest.zw) / u.resolution * 2.0 - 1.0;
    clip.y = -clip.y;

    var out: VsOut;
    out.pos = vec4<f32>(clip, 0.0, 1.0);
    out.offset = inst.src.xy - inst.dest.xy;
    // Premultiplied.
    out.color = vec4<f32>(grade(u.color_matrix * inst.color.rgb) * inst.color.a, inst.color.a);
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let mask = textureLoad(atlas, vec2<i32>(floor(in.pos.xy + in.offset)), 0).r;
    return in.color * mask;
}
`

export default class SubtitleOverlay {
    device: GPUDevice
    visible = true
    // Subtitles arrived for a frame already drawn without them.
    on_update?: () => void
    lut?: () => GPUTextureView | null

    #pipeline: GPURenderPipeline
    #immediates: Immediates
    #uniform_data = new Float32Array(16)
    #atlas: GPUTexture | null = null
    #instances: GPUBuffer | null = null
    #bindgroup: GPUBindGroup | null = null
    #uploaded: ImageFrame | null = null
    #too_large_warned = false
    #lut_bound: GPUTextureView | null = null
    #lut_dummy: GPUTexture
    #lut_sampler: GPUSampler

    #jassub: JASSUB | null = null
    // Bumped to discard results already in flight.
    #generation = 0
    #repaint = true

    #width = 0
    #height = 0
    #color_spaces = ""

    // Sorted by time.
    #entries: Entry[] = []
    // The worker's previous render; an undefined ("unchanged") result means this.
    #last_frame: ImageFrame | null = null

    #pending: number[] = []
    #in_flight: number[] = []
    #busy = false

    #deltas: number[] = []
    #frame_duration = 1 / 24
    #last_request = -1

    #shown_time = -1
    #shown_exact = true

    #target = {
        view: null as GPUTextureView | null,
        loadOp: "load" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
    }
    #target_desc: GPURenderPassDescriptor = {
        label: "subtitles",
        colorAttachments: [this.#target as any],
    }

    constructor(device: GPUDevice, format: GPUTextureFormat) {
        this.device = device

        this.#immediates = new Immediates(device, this.#uniform_data.byteLength, 1)
        const module = device.createShaderModule({
            label: "subtitles",
            code: shader(this.#immediates),
        })

        const blend: GPUBlendComponent = {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
        }

        this.#pipeline = device.createRenderPipeline({
            label: "subtitles",
            layout: "auto",
            vertex: { module, entryPoint: "vs_main" },
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [{ format, blend: { color: blend, alpha: blend } }],
            },
            primitive: { topology: "triangle-list" },
        })

        this.#immediates.bind(this.#pipeline)
        this.#uniform_data.set(IDENTITY_MATRIX)

        this.#lut_dummy = device.createTexture({
            label: "subtitle lut placeholder",
            size: [1, 1, 1],
            dimension: "3d",
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        this.#lut_sampler = device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge",
        })
    }

    set_jassub(jassub: JASSUB | null) {
        if (jassub !== this.#jassub) {
            // A request to a terminated worker never settles; don't wait on it.
            this.#busy = false
            this.#in_flight = []
        }
        this.#jassub = jassub
        if (jassub) jassub.onfontschange = () => this.#fonts_changed()
        this.#invalidate()
        this.#last_request = -1
        this.#deltas = []
    }

    // Swap chain size; masks are rendered 1:1 at it.
    resize(width: number, height: number) {
        if (width == this.#width && height == this.#height) return
        this.#width = width
        this.#height = height
        this.#invalidate()

        this.#uniform_data[12] = width
        this.#uniform_data[13] = height
    }

    // Call with the media time of each video frame as it is rendered.
    request(time: number, playing: boolean) {
        if (this.#jassub == null || this.#width == 0 || this.#height == 0) return

        // Smallest recent step: skipped frames only make steps longer.
        const delta = time - this.#last_request
        this.#last_request = time
        if (delta > MATCH_EPSILON && delta < 0.25) {
            this.#deltas.push(delta)
            if (this.#deltas.length > 16) this.#deltas.shift()
            this.#frame_duration = Math.min(...this.#deltas)
        }

        const duration = this.#frame_duration
        const ahead = Math.min(MAX_PREBUFFER_FRAMES, Math.ceil(PREBUFFER_SECONDS / duration))

        const min = time - KEEP_BEHIND_SECONDS
        const max = time + (ahead + 1) * duration
        this.#entries = this.#entries.filter(e => e.time > min && e.time < max)

        // Over budget: keep only the next frame coming.
        let count = 1
        if (playing) count = this.#buffered_bytes() > MAX_BUFFER_BYTES ? Math.min(2, ahead) : ahead

        this.#pending = []
        for (let k = 0; k < count; k++) {
            const t = time + k * duration
            if (this.#find(t)) continue
            if (this.#in_flight.some(x => Math.abs(x - t) < MATCH_EPSILON)) continue
            this.#pending.push(t)
        }

        this.#pump()
    }

    draw(pass: GPURenderPassEncoder, time: number) {
        const entry = this.#lookup(time)
        this.#shown_time = time
        this.#shown_exact =
            entry != null && !entry.stale && Math.abs(entry.time - time) < MATCH_EPSILON

        if (!this.visible || entry == null || entry.frame.count == 0) return

        const lut = this.lut?.() ?? null
        if (lut !== this.#lut_bound) {
            this.#lut_bound = lut
            this.#bindgroup = null
            this.#uniform_data[14] = lut ? 1 : 0
        }

        if (!this.#upload(entry.frame)) return

        pass.setPipeline(this.#pipeline)
        this.#immediates.set(pass, this.#uniform_data)
        pass.setBindGroup(0, this.#bind())
        pass.draw(6, entry.frame.count)
    }

    composite(encoder: GPUCommandEncoder, view: GPUTextureView, time: number) {
        this.#target.view = view
        const pass = encoder.beginRenderPass(this.#target_desc)
        this.draw(pass, time)
        pass.end()
    }

    #invalidate() {
        this.#generation++
        this.#repaint = true
        this.#pending = []
        this.#entries = []
        this.#last_frame = null
    }

    // A font arrived after libass fell back: redo the buffer, showing stale frames until replaced.
    #fonts_changed() {
        this.#generation++
        this.#repaint = true
        this.#pending = []
        this.#last_frame = null
        for (const entry of this.#entries) entry.stale = true
        this.#shown_exact = false
        this.on_update?.()
    }

    #find(time: number) {
        for (const entry of this.#entries) {
            if (!entry.stale && Math.abs(entry.time - time) < MATCH_EPSILON) return entry
        }
        return null
    }

    #lookup(time: number) {
        const exact = this.#find(time)
        if (exact) return exact

        // Not rendered yet: show the latest earlier frame rather than nothing.
        let best: Entry | null = null
        for (const entry of this.#entries) {
            if (entry.time > time) break
            best = entry
        }
        return best
    }

    #buffered_bytes() {
        // Unchanged frames share one ImageFrame.
        const frames = new Set<ImageFrame>()
        let bytes = 0
        for (const { frame } of this.#entries) {
            if (frames.has(frame)) continue
            frames.add(frame)
            bytes += (frame.atlas?.byteLength ?? 0) + (frame.instances?.byteLength ?? 0)
        }
        return bytes
    }

    async #pump() {
        if (this.#busy) return
        const jassub = this.#jassub
        if (jassub == null || this.#pending.length == 0) return

        // The frame about to be drawn goes alone, not behind a batch.
        const urgent = Math.abs(this.#pending[0] - this.#last_request) < MATCH_EPSILON
        const times = this.#pending.splice(0, urgent ? 1 : BATCH)

        this.#busy = true
        this.#in_flight = times
        const generation = this.#generation
        const repaint = this.#repaint
        this.#repaint = false

        try {
            const result = await jassub.renderImages(times, this.#width, this.#height, repaint)
            if (generation == this.#generation) {
                this.#set_color_spaces(result)
                for (let i = 0; i < times.length; i++) this.#insert(times[i], result.frames[i])
            }
        } catch (e) {
            // Rejections after a replace are expected.
            if (generation == this.#generation) {
                console.error("subtitles:", e)
                // libass may have rendered frames we never got, so "unchanged" is unreliable.
                this.#repaint = true
                this.#last_frame = null
            }
        }

        // Replaced while in flight; set_jassub already freed the queue.
        if (this.#jassub !== jassub) return

        this.#busy = false
        this.#in_flight = []
        this.#pump()
    }

    #insert(time: number, rendered: ImageFrame | undefined) {
        const frame = rendered ?? this.#last_frame
        this.#last_frame = frame
        if (frame == null) return

        let i = this.#entries.length
        while (i > 0 && this.#entries[i - 1].time > time) i--
        if (i > 0 && Math.abs(this.#entries[i - 1].time - time) < MATCH_EPSILON) {
            this.#entries[i - 1] = { time, frame }
        } else {
            this.#entries.splice(i, 0, { time, frame })
        }

        if (!this.#shown_exact && Math.abs(time - this.#shown_time) < MATCH_EPSILON) {
            this.on_update?.()
        }
    }

    #set_color_spaces({ subtitleColorSpace, videoColorSpace }: RenderedImages) {
        const key = `${subtitleColorSpace}:${videoColorSpace}`
        if (key == this.#color_spaces) return
        this.#color_spaces = key

        const matrix =
            (subtitleColorSpace &&
                videoColorSpace &&
                colorMatrixConversionMap[subtitleColorSpace]?.[videoColorSpace]) ||
            IDENTITY_MATRIX
        this.#uniform_data.set(matrix)
    }

    // At draw time, so one atlas serves the whole buffer; queue order keeps earlier submits
    // reading the previous contents.
    #upload(frame: ImageFrame): boolean {
        if (frame === this.#uploaded) return true

        const max = this.device.limits.maxTextureDimension2D
        if (frame.width > max || frame.height > max) {
            if (!this.#too_large_warned) {
                console.warn(`subtitles: ${frame.width}x${frame.height} atlas exceeds ${max}`)
                this.#too_large_warned = true
            }
            return false
        }

        if (
            this.#atlas == null ||
            this.#atlas.width < frame.width ||
            this.#atlas.height < frame.height
        ) {
            const round = (n: number) => Math.min(max, Math.ceil(n / 256) * 256)
            const old = this.#atlas
            this.#atlas = this.device.createTexture({
                label: "subtitle atlas",
                size: [
                    round(Math.max(frame.width, old?.width ?? 0, 1024)),
                    round(Math.max(frame.height, old?.height ?? 0, 256)),
                ],
                format: "r8unorm",
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            })
            if (old) this.device.queue.onSubmittedWorkDone().then(() => old.destroy())
            this.#bindgroup = null
        }

        const bytes = frame.instances!.byteLength
        if (this.#instances == null || this.#instances.size < bytes) {
            const old = this.#instances
            this.#instances = this.device.createBuffer({
                label: "subtitle instances",
                size: Math.max(bytes, (old?.size ?? 0) * 2, 48 * 256),
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            })
            if (old) this.device.queue.onSubmittedWorkDone().then(() => old.destroy())
            this.#bindgroup = null
        }

        this.device.queue.writeTexture(
            { texture: this.#atlas },
            frame.atlas!,
            { bytesPerRow: frame.width },
            [frame.width, frame.height],
        )
        this.device.queue.writeBuffer(this.#instances, 0, frame.instances!)
        this.#uploaded = frame

        return true
    }

    // Separate from the upload: the LUT can change while the uploaded frame doesn't, and binding
    // null invalidates the whole frame's command buffer.
    #bind(): GPUBindGroup {
        if (this.#bindgroup == null) {
            this.#bindgroup = this.device.createBindGroup({
                label: "subtitles",
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 1, resource: { buffer: this.#instances! } },
                    { binding: 2, resource: this.#atlas!.createView() },
                    { binding: 3, resource: this.#lut_bound ?? this.#lut_dummy.createView() },
                    { binding: 4, resource: this.#lut_sampler },
                ],
            })
        }
        return this.#bindgroup
    }
}
