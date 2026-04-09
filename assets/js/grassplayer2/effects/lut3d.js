import Effect from "./_effect"

const DEFAULT_LUT = new Uint32Array([      // (b, g, r)
    0b11_0000000000_0000000000_0000000000, // (0, 0, 0)
    0b11_0000000000_0000000000_1111111111, // (0, 0, 1)
    0b11_0000000000_1111111111_0000000000, // (0, 1, 0)
    0b11_0000000000_1111111111_1111111111, // (0, 1, 1)
    0b11_1111111111_0000000000_0000000000, // (1, 0, 0)
    0b11_1111111111_0000000000_1111111111, // (1, 0, 1)
    0b11_1111111111_1111111111_0000000000, // (1, 1, 0)
    0b11_1111111111_1111111111_1111111111, // (1, 1, 1)
])
const DEFAULT_LUT_F16 = new Float16Array([      // (r, g, b, a)
    0, 0, 0, 1, // (0, 0, 0, 1)
    1, 0, 0, 1, // (1, 0, 0, 1)
    0, 1, 0, 1, // (0, 1, 0, 1)
    1, 1, 0, 1, // (1, 1, 0, 1)
    0, 0, 1, 1, // (0, 0, 1, 1)
    1, 0, 1, 1, // (1, 0, 1, 1)
    0, 1, 1, 1, // (0, 1, 1, 1)
    1, 1, 1, 1, // (1, 1, 1, 1)
])


export default class EffectLut3d extends Effect {
    #txt_3dlut_name
    create_settings(el) {
        el.innerHTML = `
<div><span class="lut3d-name">Identity</span></div>
<div><button>Load madVR 3dlut</button></div>
`
        this.#txt_3dlut_name = el.querySelector(".lut3d-name")

        el.querySelector("button")
            .addEventListener("click", () => this.#load_3dlut())
    }

    #pipeline
    #lut3dtexture = null
    #sampler
    init() {
        super.init()

        this.#pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var lutTexture: texture_3d<f32>;
@group(0) @binding(3) var samp: sampler;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(inputTexture);
    let lutSize = f32(textureDimensions(lutTexture).x);

    if (id.x >= size.x || id.y >= size.y) {
        return;
    }

    // sample
    let sample = textureLoad(inputTexture, id.xy, 0);

    // convert to limited rgb
    var limited = clamp(sample.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    limited = mix(vec3(16.0 / 255.0), vec3(235.0 / 255.0), limited);

    // lut
    let lutCoords = mix(vec3(0.5 / lutSize), vec3(1.0 - 0.5 / lutSize), limited);
    var sample_lut = textureSampleLevel(lutTexture, samp, lutCoords, 0.0).rgb;

    // convert to full range rgb
    sample_lut = (sample_lut - vec3(16.0 / 255.0)) * vec3(255.0 / 219.0);
    sample_lut += 140.0 / 65535.0;

    textureStore(outputTexture, id.xy, vec4<f32>(sample_lut, sample.a));
}`)
            },
        })

        if (this.#lut3dtexture == null) {
            const m = 8
            const lut = new Uint32Array(m * m * m)

            for (let r = 0; r < m; r++) {
                for (let g = 0; g < m; g++) {
                    for (let b = 0; b < m; b++) {
                        const c = 0xc0000000 + ((r / (m - 1) * 1023) << 20) +
                            ((g / (m - 1) * 1023) << 10) +
                            (b / (m - 1) * 1023)
                        lut[r * m * m + g * m + b] = c
                    }
                }
            }

            this.#lut3dtexture = this.#generate_3d_texture(lut, m)
        }

        this.#sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        })
    }

    resize(w, h) { }

    #tex1_res
    #compute_x
    #compute_y
    #tex1
    #tex2
    #bindgroup
    run(encoder, t, video_time, tex1_res, tex1, get_texture) {
        if (this.#tex1_res != tex1_res) {
            this.#compute_x = Math.ceil(tex1_res[0] / 16)
            this.#compute_y = Math.ceil(tex1_res[1] / 16)
            this.#tex1_res = tex1_res
        }

        const tex2 = get_texture(tex1_res, [tex1])

        if (this.#tex1 != tex1 || this.#tex2 != tex2) {
            this.#tex1 = tex1
            this.#tex2 = tex2

            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex1 },
                    { binding: 1, resource: tex2 },
                    { binding: 2, resource: this.#lut3dtexture },
                    { binding: 3, resource: this.#sampler },
                ]
            })
        }
        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.dispatchWorkgroups(this.#compute_x, this.#compute_y)
        pass.end()

        return [tex2, tex1_res]
    }

    #generate_3d_texture(data, width) {
        const texture = this.device.createTexture({
            size: [width, width, width],
            dimension: "3d",
            format: "rgb10a2unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        })

        this.device.queue.writeTexture(
            { texture },
            data,
            { bytesPerRow: width * 4, rowsPerImage: width },
            [width, width, width],
        )

        return texture
    }

    #load_3dlut() {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = ".3dlut"
        input.click()
        input.onchange = e => {
            const file = e.target.files[0]

            const reader = new FileReader()
            reader.readAsArrayBuffer(file)

            reader.onload = readerEvent => {
                try {
                    const data = readerEvent.target.result.slice(16384)
                    const data_view = new Uint8Array(data)
                    let lut = new Uint32Array(256 * 256 * 256)

                    for (let i = 0; i < 256 * 256 * 256; i++) {
                        const r = i >> 16
                        const g = (i >> 8) & 0xFF
                        const b = i & 0xFF

                        let old_r = (data_view[i * 6 + 5] << 8) + data_view[i * 6 + 4]
                        let new_r = old_r >> 6
                        let old_g = (data_view[i * 6 + 3] << 8) + data_view[i * 6 + 2]
                        let new_g = old_g >> 6
                        let old_b = (data_view[i * 6 + 1] << 8) + data_view[i * 6 + 0]
                        let new_b = old_b >> 6

                        let combined = 0xc0000000 + (new_b << 20) + (new_g << 10) + new_r
                        let new_loc = ((b << 16) + (g << 8) + r)
                        lut[new_loc] = combined
                    }

                    this.#lut3dtexture = this.#generate_3d_texture(lut, 256)
                    this.#tex1 = null
                    this.#tex2 = null
                    this.#txt_3dlut_name.textContent = file.name
                    this.on_update()
                }
                catch (e) { console.log(e) }
            }
        }
    }
}
