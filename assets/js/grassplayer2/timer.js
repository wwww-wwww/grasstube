const QUERY_COUNT = 64

export default class Timer {
    #labelmap = []
    #encoder = null
    #i = 0
    #querySet = null
    #resolveBuffer = null
    #resultBuffer = null
    #supported = false

    enabled = true

    constructor(device, supported = true) {
        this.#supported = supported && device.features.has("timestamp-query")
        if (!this.#supported) return

        this.#querySet = device.createQuerySet({
            type: "timestamp",
            count: QUERY_COUNT,
        })
        this.#resolveBuffer = device.createBuffer({
            size: this.#querySet.count * 8,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        })
        this.#resultBuffer = device.createBuffer({
            size: this.#resolveBuffer.size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })
    }

    get supported() {
        return this.#supported
    }

    // Timing a pass costs two query slots. Once the set is full the remaining passes run untimed
    // rather than tripping a validation error and killing the frame.
    #timestamps(desc) {
        if (!this.enabled || !this.#supported) return null
        if (this.#i + 2 > QUERY_COUNT) return null

        const writes = {
            querySet: this.#querySet,
            beginningOfPassWriteIndex: this.#i,
            endOfPassWriteIndex: this.#i + 1,
        }
        this.#labelmap[this.#i / 2] = desc.label
        this.#i += 2
        return writes
    }

    beginComputePass(desc = {}) {
        const timestampWrites = this.#timestamps(desc)
        if (timestampWrites === null) return this.#encoder.beginComputePass(desc)
        return this.#encoder.beginComputePass({ ...desc, timestampWrites })
    }

    beginRenderPass(desc = {}) {
        const timestampWrites = this.#timestamps(desc)
        if (timestampWrites === null) return this.#encoder.beginRenderPass(desc)
        return this.#encoder.beginRenderPass({ ...desc, timestampWrites })
    }

    start(encoder) {
        this.#encoder = encoder
        this.#i = 0
        if (this.enabled && this.#supported) this.#labelmap = []
    }

    run(effect, a, b, c, d, e, f, g) {
        return effect.run(this, a, b, c, d, e, f, g)
    }

    finish() {
        if (!this.enabled || !this.#supported) return
        if (this.#i == 0) return
        if (this.#resultBuffer.mapState !== "unmapped") return

        // Only resolve and copy the slots this frame actually used.
        this.#encoder.resolveQuerySet(this.#querySet, 0, this.#i, this.#resolveBuffer, 0)
        this.#encoder.copyBufferToBuffer(this.#resolveBuffer, 0, this.#resultBuffer, 0, this.#i * 8)
    }

    async results() {
        if (!this.enabled || !this.#supported) throw new Error("timing disabled")
        if (this.#resultBuffer.mapState !== "unmapped") throw new Error("busy")

        // Capture the labels now: the next frame's start() swaps in a fresh array while the map
        // below is still in flight.
        const labels = this.#labelmap
        const n = labels.length
        if (n == 0) throw new Error("nothing timed")

        await this.#resultBuffer.mapAsync(GPUMapMode.READ, 0, n * 2 * 8)
        const times = new BigUint64Array(this.#resultBuffer.getMappedRange(0, n * 2 * 8))

        const passes = []
        let sum = 0
        for (let i = 0; i < n; i++) {
            const duration = Number(times[i * 2 + 1] - times[i * 2])
            sum += duration
            passes[i] = [labels[i], duration]
        }

        this.#resultBuffer.unmap()

        return { sum, passes }
    }
}
