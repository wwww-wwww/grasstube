import Effect from "./_effect"
import { FULLSCREEN_VERTEX, FullscreenTarget, create_fullscreen_pipeline } from "./_fullscreen"

export default class EffectLut3d extends Effect {
    #txt_3dlut_name
    create_settings(el) {
        el.innerHTML = `
<div><span class="lut3d-name">Identity</span></div>
<div><button>Load madVR 3dlut</button></div>
`
        this.#txt_3dlut_name = el.querySelector(".lut3d-name")

        el.querySelector("button").addEventListener("click", () => this.#load_3dlut())
    }

    #pipeline
    #lut3dtexture = null
    #lut3dview = null
    #sampler
    init() {
        super.init()

        this.#pipeline = create_fullscreen_pipeline(
            this.device,
            this.create_shader(/* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var lutTexture: texture_3d<f32>;
@group(0) @binding(2) var samp: sampler;
${FULLSCREEN_VERTEX}
@fragment
fn fs_main(in: FsVertexOutput) -> @location(0) vec4<f32> {
    let lutSize = f32(textureDimensions(lutTexture).x);

    // sample
    let sample = textureLoad(inputTexture, vec2<i32>(in.pos.xy), 0);

    // convert to limited rgb
    var limited = clamp(sample.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    limited = mix(vec3(16.0 / 255.0), vec3(235.0 / 255.0), limited);

    // lut
    let lutCoords = mix(vec3(0.5 / lutSize), vec3(1.0 - 0.5 / lutSize), limited);
    let sample_lut = textureSampleLevel(lutTexture, samp, lutCoords, 0.0).rgb;

    return vec4<f32>(sample_lut, sample.a);
}`),
            "rgba16float",
            this.constructor.name,
        )

        if (this.#lut3dtexture == null) {
            const m = 8
            const lut = new Float16Array(m * m * m * 4)

            for (let r = 0; r < m; r++) {
                for (let g = 0; g < m; g++) {
                    for (let b = 0; b < m; b++) {
                        const loc = (b * m * m + g * m + r) * 4
                        lut[loc + 0] = ((r / (m - 1)) * 65535 - 4096) / 56064
                        lut[loc + 1] = ((g / (m - 1)) * 65535 - 4096) / 56064
                        lut[loc + 2] = ((b / (m - 1)) * 65535 - 4096) / 56064
                    }
                }
            }

            this.#generate_3d_texture(lut, m)
        }

        navigator.storage
            .getDirectory()
            .then(root => root.getFileHandle("main.3dlut"))
            .then(handle => handle.getFile())
            .then(file => file.arrayBuffer())
            .then(buf => this.#load_madvr(buf))
            .then(lut => {
                this.#generate_3d_texture(lut, 256)
                this.renderer.player.create_message("Loaded 3dlut", 1000)
                this.#lut_bound = null
                this.#txt_3dlut_name.textContent = this.get_storage("filename")

                this.on_update()
            })

        this.#sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge",
        })
    }

    #tex_in
    #lut_bound
    #bindgroup
    #target = new FullscreenTarget(this.constructor.name)
    run(encoder, video_time, tex_in, tex_in_res) {
        const tex2 = this.get_texture(tex_in_res, [tex_in])

        if (this.#tex_in != tex_in || this.#lut_bound != this.#lut3dview) {
            this.#tex_in = tex_in
            this.#lut_bound = this.#lut3dview

            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex_in },
                    { binding: 1, resource: this.#lut3dview },
                    { binding: 2, resource: this.#sampler },
                ],
            })
        }

        const pass = this.#target.begin(encoder, tex2)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.draw(3)
        pass.end()

        return [tex2, tex_in_res]
    }

    #generate_3d_texture(data, width) {
        const texture = this.device.createTexture({
            label: `lut3d ${width}`,
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

        // A 256^3 rgba16float LUT is 128 MB; replacing one without releasing the old one would
        // leak that much VRAM every time a file is loaded.
        const previous = this.#lut3dtexture
        if (previous != null) {
            this.device.queue.onSubmittedWorkDone().then(() => previous.destroy())
        }

        this.#lut3dtexture = texture
        this.#lut3dview = texture.createView()

        return texture
    }

    #load_madvr(buf) {
        return new Promise((resolve, reject) => {
            const worker = new Worker("/assets/grassplayer2/effects/lut3d-worker.js")
            worker.onmessage = e => {
                resolve(e.data)
            }
            worker.postMessage(buf)
        })
    }

    #load_3dlut() {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = ".3dlut"
        input.click()
        input.onchange = e => {
            const file = e.target.files[0]

            file.arrayBuffer().then(buf => {
                this.#load_madvr(buf).then(lut => {
                    this.#generate_3d_texture(lut, 256)
                    console.info("Loaded 3dlut")
                    this.renderer.player.create_message("Loaded 3dlut", 1000)

                    navigator.storage
                        .getDirectory()
                        .then(root => root.getFileHandle("main.3dlut", { create: true }))
                        .then(handle => handle.createWritable())
                        .then(async file => {
                            await file.write(buf)
                            await file.close()
                        })
                        .then(() => {
                            this.set_storage("filename", file.name)
                            console.info("Saved 3dlut")
                            this.renderer.player.create_message("Saved 3dlut", 1000)
                        })

                    this.#lut_bound = null
                    this.#txt_3dlut_name.textContent = file.name

                    this.on_update()
                })
            })
        }
    }
}
