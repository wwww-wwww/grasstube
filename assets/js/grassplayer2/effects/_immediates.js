// Small per-pass shader data via WebGPU immediates, with a uniform buffer fallback.
//
// To drop the fallback once immediates are available everywhere: delete the blocks marked
// UNIFORM FALLBACK and make `use` always true. Call sites need no change (bind() becomes a no-op).
//
// Pipelines must use layout: "auto" (or a layout with a matching immediateSize).

export const immediates_supported =
    navigator.gpu?.wgslLanguageFeatures?.has("immediate_address_space") ?? false

export class Immediates {
    device
    size
    group
    use

    /**
     * @param size bytes, a multiple of 4; the struct's uniform-layout size.
     * @param group bind group index for the fallback uniform; must be unused by the shader.
     */
    constructor(device, size, group) {
        this.device = device
        this.size = size
        this.group = group
        this.use = immediates_supported && (device.limits.maxImmediateSize ?? 0) >= size
    }

    // Must come first in the shader.
    directive() {
        return this.use ? "requires immediate_address_space;" : ""
    }

    // WGSL declaring `name: type`.
    declare(name, type) {
        if (this.use) return `var<immediate> ${name}: ${type};`
        // UNIFORM FALLBACK
        return `@group(${this.group}) @binding(0) var<uniform> ${name}: ${type};`
    }

    /** Call with each pipeline using declare(), before set(). */
    bind(pipeline) {
        if (this.use) return
        // UNIFORM FALLBACK
        this.#buffer ??= this.device.createBuffer({
            label: "immediates fallback",
            size: this.size,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.#bindgroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(this.group),
            entries: [{ binding: 0, resource: { buffer: this.#buffer } }],
        })
        this.#last = null
    }

    /** Sets `data` (an ArrayBuffer or view) for the draws and dispatches that follow in `pass`. */
    set(pass, data) {
        if (this.use) {
            pass.setImmediates(0, data)
            return
        }

        // UNIFORM FALLBACK
        // writeBuffer lands before the whole submit, so unlike immediates this cannot give two
        // passes in one submit different values.
        const bytes = ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data)
        if (this.#last == null || !equal(this.#last, bytes)) {
            this.device.queue.writeBuffer(this.#buffer, 0, bytes)
            this.#last = bytes.slice()
        }
        pass.setBindGroup(this.group, this.#bindgroup)
    }

    // UNIFORM FALLBACK
    #buffer = null
    #bindgroup = null
    #last = null
}

// UNIFORM FALLBACK
function equal(a, b) {
    if (a.length != b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] != b[i]) return false
    return true
}
