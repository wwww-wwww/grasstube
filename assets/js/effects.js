import Effect from "./effect"

class EffectLoad extends Effect {
    constructor(device) {
        super(device)

        this.pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
@group(0) @binding(0) var inputVideo: texture_external;
@group(1) @binding(0) var outputTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(outputTex);
    if (id.x >= size.x || id.y >= size.y) { return; }

    let color = textureLoad(inputVideo, id.xy);
    textureStore(outputTex, id.xy, color);
}`)
            },
        })
        this.texture2 = null
        this.bindgroup = null
    }
    run(encoder, t, video_time, texture1, texture2) {
        if (this.t != texture2) {
            this.t = texture2
            this.bindgroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(1),
                entries: [{ binding: 0, resource: texture2 }]
            })
        }

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.pipeline)
        pass.setBindGroup(0, this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: texture1 }]
        }))
        pass.setBindGroup(1, this.bindgroup)
        pass.dispatchWorkgroups(this.x, this.y)
        pass.end()
    }
}

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

class EffectLut3d extends Effect {
    create_settings(el) {
        el.innerHTML = `
<div><span class="lut3d-name">Identity</span></div>
<div><button>Load madVR 3dlut</button></div>
`
        this.txt_3dlut_name = el.querySelector(".lut3d-name")
        const btn_3dlut = el.querySelector("button")
        btn_3dlut.addEventListener("click", () => this.load_3dlut())
    }
    init() {
        this.pipeline = this.device.createComputePipeline({
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

    // normalize coords
    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(size);

    // sample
    let sample = textureSampleLevel(inputTexture, samp, uv, 0.0);

    // convert to limited rgb
    var limited = clamp(sample.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    limited = mix(vec3(16.0 / 255.0), vec3(235.0 / 255.0), limited);

    // lut
    let lutCoords = limited * ((lutSize - 1.0) / lutSize) + (0.5 / lutSize);
    var sample_lut = textureSampleLevel(lutTexture, samp, lutCoords, 0.0).rgb;

    // convert to full range rgb
    sample_lut = (sample_lut - vec3(16.0 / 255.0)) * vec3(255.0 / 219.0);
    sample_lut += 140.0 / 65535.0;

    textureStore(outputTexture, id.xy, vec4<f32>(sample_lut, sample.a));
}`)
            },
        })
        this.lut3dtexture = this.generate_3d_texture(DEFAULT_LUT, 2)
        this.sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        })
        this.texture1 = null
        this.texture2 = null
    }
    run(encoder, t, video_time, texture1, texture2) {
        if (this.texture1 != texture1 || this.texture2 != texture2) {
            this.texture1 = texture1
            this.texture2 = texture2
            console.log("change")
            this.bindgroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: texture1 },
                    { binding: 1, resource: texture2 },
                    { binding: 2, resource: this.lut3dtexture },
                    { binding: 3, resource: this.sampler },
                ]
            })
        }
        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.pipeline)

        pass.setBindGroup(0, this.bindgroup)
        pass.dispatchWorkgroups(this.x, this.y)
        pass.end()
    }
    generate_3d_texture(data, width) {
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
    load_3dlut() {
        var input = document.createElement("input")
        input.type = "file"
        input.accept = ".3dlut"
        input.click()
        input.onchange = e => {
            var file = e.target.files[0]

            var reader = new FileReader()
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

                        let combined = 0xc0000000 + (new_b << 20) + (new_g << 10) + new_r;
                        let new_loc = ((b << 16) + (g << 8) + r)
                        lut[new_loc] = combined
                    }

                    this.lut3dtexture = this.generate_3d_texture(lut, 256)
                    this.txt_3dlut_name.textContent = file.name
                }
                catch (e) { console.log(e) }
            }
        }
    }
}

class EffectDeband extends Effect {
    #bindgroup
    constructor(device) {
        super(device)
        this.enabled = true
    }
    create_settings(el) {
        el.innerHTML = `
<div><span>Grain</span><input class="input-grain" type="number" value="64"/></div>
<div><span>Threshold</span><input class="input-threshold" type="number" value="48"/></div>
<div><span>Range</span><input class="input-range" type="number" value="15"/></div>
`
        el.querySelector(".input-grain").addEventListener("input", e => {
            this.uniformData[0] = parseInt(e.target.value)
        })
        el.querySelector(".input-threshold").addEventListener("input", e => {
            this.uniformData[1] = parseInt(e.target.value)
        })
        el.querySelector(".input-range").addEventListener("input", e => {
            this.uniformData[2] = parseInt(e.target.value)
        })
    }
    init() {
        this.pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
struct Uniforms {
    grain: f32,
    threshold: f32,
    range: f32,
    random: f32,
};
struct AverageOut {
    avg: vec3<f32>,
    h: f32,
}
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var samp: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

fn mod289(x: f32)  -> f32 { return x - floor(x / 289.0) * 289.0; }
fn permute(x: f32) -> f32 { return mod289((34.0*x + 1.0) * x); }
fn rand(x: f32)    -> f32 { return fract(x / 41.0); }
fn average(uv: vec2<f32>, size: vec2<f32>, range: f32, h0: f32) -> AverageOut {
    var h = h0;

    // Compute a random rangle and distance
    let dist = rand(h) * range;     h = permute(h);
    let dir  = rand(h) * 6.2831853; h = permute(h);

    let o = vec2<f32>(cos(dir), sin(dir)) * dist / size;

    // Sample at quarter-turn intervals around the source pixel
    let avg =
        textureSampleLevel(inputTexture, samp, uv + vec2(o.x, o.y), 0.0).rgb +
        textureSampleLevel(inputTexture, samp, uv + vec2(-o.x, o.y), 0.0).rgb +
        textureSampleLevel(inputTexture, samp, uv + vec2(-o.x, -o.y), 0.0).rgb +
        textureSampleLevel(inputTexture, samp, uv + vec2(o.x, -o.y), 0.0).rgb;

    // Return the (normalized) average
    return AverageOut(avg / 4.0, h);
}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(inputTexture);

    if (id.x >= size.x || id.y >= size.y) {
        return;
    }

    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(size);

    let m = vec3(uv, uniforms.random) + vec3(1.0);
    var h = permute(permute(permute(m.x)+m.y)+m.z);

    let sample = textureSampleLevel(inputTexture, samp, uv, 0.0);

    var debanded = sample.rgb;

    for (var i = 1; i <= 3; i++) {
        // Use the average instead if the difference is below the threshold
        let avg = average(uv, vec2<f32>(size), f32(i) * uniforms.range, h);
        h = avg.h;
        let diff = abs(debanded - avg.avg);
        let comp_val = uniforms.threshold / (f32(i) * 8192.0);
        debanded = mix(avg.avg, debanded, vec3<f32>(diff > vec3<f32>(comp_val)));
    }

    var noise = vec3(0.0);
    noise.x = rand(h); h = permute(h);
    noise.y = rand(h); h = permute(h);
    noise.z = rand(h); h = permute(h);
    debanded += (uniforms.grain / 4096.0) * (noise - vec3(0.5));

    textureStore(outputTexture, id.xy, vec4<f32>(debanded.rgb, sample.a));
}`)
            },
        })
        this.sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        })
        this.uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.uniformData = new Float32Array(4)
        this.uniformData[0] = 64
        this.uniformData[1] = 48
        this.uniformData[2] = 15
        this.uniformData[3] = 0
        this.texture1 = null
        this.texture2 = null

        this.bindgroup_uniforms = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
            ]
        })
    }
    run(encoder, t, video_time, texture1, texture2) {
        if (this.texture1 != texture1 || this.texture2 != texture2) {
            this.texture1 = this.texture1
            this.texture2 = this.texture2
            this.bindgroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: texture1 },
                    { binding: 1, resource: texture2 },
                    { binding: 2, resource: this.sampler },
                ]
            })
        }

        this.uniformData[3] = video_time
        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.pipeline)
        pass.setBindGroup(0, this.bindgroup)
        pass.setBindGroup(1, this.bindgroup_uniforms)
        pass.dispatchWorkgroups(this.x, this.y)
        pass.end()
    }
}

export {
    EffectDeband,
    EffectLoad,
    EffectLut3d
}

