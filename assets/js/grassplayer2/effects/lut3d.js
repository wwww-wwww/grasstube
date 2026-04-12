import Effect from "./_effect"

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

    if (id.x >= size.x || id.y >= size.y) { return; }

    let lutSize = f32(textureDimensions(lutTexture).x);

    // sample
    let sample = textureLoad(inputTexture, id.xy, 0);

    // convert to limited rgb
    var limited = clamp(sample.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    limited = mix(vec3(16.0 / 255.0), vec3(235.0 / 255.0), limited);

    // lut
    let lutCoords = mix(vec3(0.5 / lutSize), vec3(1.0 - 0.5 / lutSize), limited);
    var sample_lut = textureSampleLevel(lutTexture, samp, lutCoords, 0.0).rgb;

    textureStore(outputTexture, id.xy, vec4<f32>(sample_lut, sample.a));
}`)
            },
        })

        if (this.#lut3dtexture == null) {
            const m = 8
            const lut = new Float16Array(m * m * m * 4)

            for (let r = 0; r < m; r++) {
                for (let g = 0; g < m; g++) {
                    for (let b = 0; b < m; b++) {
                        const loc = (b * m * m + g * m + r) * 4
                        lut[loc + 0] = (r / (m - 1) * 65535 - 4096) / 56064
                        lut[loc + 1] = (g / (m - 1) * 65535 - 4096) / 56064
                        lut[loc + 2] = (b / (m - 1) * 65535 - 4096) / 56064
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

    #tex1_res
    #compute_x
    #compute_y
    #tex1
    #tex2
    #bindgroup
    run(encoder, video_time, tex1, tex1_res) {
        if (this.#tex1_res != tex1_res) {
            this.#compute_x = Math.ceil(tex1_res[0] / 16)
            this.#compute_y = Math.ceil(tex1_res[1] / 16)
            this.#tex1_res = tex1_res
        }

        const tex2 = this.get_texture(tex1_res, [tex1])

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
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        })

        this.device.queue.writeTexture(
            { texture },
            data,
            { bytesPerRow: width * 4 * 2, rowsPerImage: width },
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
                    const data_view = new Uint16Array(data)
                    const lut = new Float16Array(256 * 256 * 256 * 4)

                    for (let i = 0; i < 256 * 256 * 256; i++) {
                        const r = i >> 16
                        const g = (i >> 8) & 0xFF
                        const b = i & 0xFF

                        const old_r = (data_view[i * 3 + 2])
                        const old_g = (data_view[i * 3 + 1])
                        const old_b = (data_view[i * 3 + 0])

                        const loc = ((b << 16) + (g << 8) + r)
                        lut[loc * 4 + 0] = (old_r - 4096) / 56064
                        lut[loc * 4 + 1] = (old_g - 4096) / 56064
                        lut[loc * 4 + 2] = (old_b - 4096) / 56064
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
