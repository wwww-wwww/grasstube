export default class Timer {
    #labelmap
    #encoder
    #i
    #querySet
    #resolveBuffer
    #resultBuffer
    enabled = true
    constructor(device) {
        this.#querySet = device.createQuerySet({
            type: "timestamp",
            count: 32,
        })
        this.#resolveBuffer = device.createBuffer({
            size: this.#querySet.count * 8,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        })
        this.#resultBuffer = device.createBuffer({
            size: this.#resolveBuffer.size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
    }

    beginComputePass(desc = {}) {
        if (!this.enabled) {
            return this.#encoder.beginComputePass(desc)
        }
        const pass = this.#encoder.beginComputePass({
            ...desc,
            timestampWrites: {
                querySet: this.#querySet,
                beginningOfPassWriteIndex: this.#i++,
                endOfPassWriteIndex: this.#i++,
            }
        })
        this.#labelmap[this.#i / 2 - 1] = desc.label
        return pass
    }

    beginRenderPass(desc = {}) {
        if (!this.enabled) {
            return this.#encoder.beginRenderPass(desc)
        }
        const pass = this.#encoder.beginRenderPass({
            ...desc,
            timestampWrites: {
                querySet: this.#querySet,
                beginningOfPassWriteIndex: this.#i++,
                endOfPassWriteIndex: this.#i++,
            }
        })
        this.#labelmap[this.#i / 2 - 1] = desc.label
        return pass
    }

    start(encoder) {
        this.#labelmap = []
        this.#encoder = encoder
        this.#i = 0
    }

    run(effect, a, b, c, d, e, f, g) {
        return effect.run(this, a, b, c, d, e, f, g)
    }

    finish() {
        if (!this.enabled) return
        this.#encoder.resolveQuerySet(this.#querySet, 0, this.#querySet.count, this.#resolveBuffer, 0)

        if (this.#resultBuffer.mapState === "unmapped") {
            this.#encoder.copyBufferToBuffer(this.#resolveBuffer, 0, this.#resultBuffer, 0, this.#resultBuffer.size)
        }
    }

    results() {
        return new Promise(async (resolve, reject) => {
            if (this.#resultBuffer.mapState === "unmapped") {
                await this.#resultBuffer.mapAsync(GPUMapMode.READ)
                const times = new BigUint64Array(this.#resultBuffer.getMappedRange())
                const passes = []

                let sum = 0
                for (let i = 0; i < this.#labelmap.length; i++) {
                    const duration = Number(times[i * 2 + 1] - times[i * 2])
                    sum += duration
                    passes[i] = [this.#labelmap[i], duration]
                }

                this.#resultBuffer.unmap()

                resolve({ sum, passes })
            } else {
                reject()
            }
        })
    }

}
