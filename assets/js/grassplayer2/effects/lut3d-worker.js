self.onmessage = function (e) {
    const data = e.data.slice(16384)
    const data_view = new Uint16Array(data)
    const lut = new Float16Array(256 * 256 * 256 * 4)

    for (let i = 0; i < 256 * 256 * 256; i++) {
        const r = i >> 16
        const g = (i >> 8) & 0xff
        const b = i & 0xff

        const old_r = data_view[i * 3 + 2]
        const old_g = data_view[i * 3 + 1]
        const old_b = data_view[i * 3 + 0]

        const loc = (b << 16) + (g << 8) + r
        lut[loc * 4 + 0] = (old_r - 4096) / 56064
        lut[loc * 4 + 1] = (old_g - 4096) / 56064
        lut[loc * 4 + 2] = (old_b - 4096) / 56064
    }
    self.postMessage(lut)
}
