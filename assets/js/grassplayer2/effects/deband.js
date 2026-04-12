import Effect from "./_effect"

export default class EffectDeband extends Effect {
    enabled = true
    create_settings(el) {
        el.innerHTML = `
<div><span>Grain</span><input class="input-grain" type="number" value="64"/></div>
<div><span>Threshold</span><input class="input-threshold" type="number" value="48"/></div>
<div><span>Range</span><input class="input-range" type="number" value="15"/></div>
`
        el.querySelector(".input-grain").addEventListener("input", e => {
            this.#uniformData[0] = parseInt(e.target.value)
            this.on_update()
        })
        el.querySelector(".input-threshold").addEventListener("input", e => {
            this.#uniformData[1] = parseInt(e.target.value)
            this.on_update()
        })
        el.querySelector(".input-range").addEventListener("input", e => {
            this.#uniformData[2] = parseInt(e.target.value)
            this.on_update()
        })
    }

    #pipeline
    #sampler
    #uniformBuffer
    #uniformData
    #bindgroup_uniforms
    init() {
        super.init()

        this.#pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
struct Uniforms {
    grain: f32,
    threshold: f32,
    range: f32,
    random: f32,
}

struct AverageOut {
    avg: vec3<f32>,
    h: f32,
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var samp: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

fn rgb_to_ycbcr_rec709(rgb: vec3<f32>) -> vec3<f32> {
    let rgb_to_ycbcr_mat = mat3x3<f32>(
        vec3<f32>(0.2126, -0.114572,  0.5),
        vec3<f32>(0.7152, -0.385428, -0.454153),
        vec3<f32>(0.0722,  0.5,      -0.045847)
    );

    let ycbcr = rgb_to_ycbcr_mat * rgb;

    return ycbcr + vec3<f32>(0.0, 0.5, 0.5);
}

fn ycbcr_to_rgb_rec709(ycbcr: vec3<f32>) -> vec3<f32> {
    let ycbcr_centered = ycbcr - vec3<f32>(0.0, 0.5, 0.5);

    let ycbcr_to_rgb_mat = mat3x3<f32>(
        vec3<f32>(1.0, 1.0, 1.0),
        vec3<f32>(0.0, -0.187324, 1.8556),
        vec3<f32>(1.5748, -0.468124, 0.0)
    );

    return ycbcr_to_rgb_mat * ycbcr_centered;
}

fn sample_yuv(uv: vec2<f32>) -> vec4<f32> {
    let rgb = textureSampleBaseClampToEdge(inputTexture, samp, uv);
    return vec4(rgb_to_ycbcr_rec709(rgb.rgb), rgb.a);
}

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
        sample_yuv(uv + vec2(o.x, o.y)).rgb +
        sample_yuv(uv + vec2(-o.x, o.y)).rgb +
        sample_yuv(uv + vec2(-o.x, -o.y)).rgb +
        sample_yuv(uv + vec2(o.x, -o.y)).rgb;

    // Return the (normalized) average
    return AverageOut(avg / 4.0, h);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(inputTexture);

    if (id.x >= size.x || id.y >= size.y) { return; }

    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(size);

    let m = vec3(uv, uniforms.random) + vec3(1.0);
    var h = permute(permute(permute(m.x) + m.y) + m.z);

    let sample = textureLoad(inputTexture, id.xy, 0);

    var debanded = rgb_to_ycbcr_rec709(sample.rgb);

    for (var i = 1; i <= 3; i++) {
        // Use the average instead if the difference is below the threshold
        let avg = average(uv, vec2<f32>(size), f32(i) * uniforms.range, h);
        h = avg.h;
        let diff = abs(debanded - avg.avg);
        let comp_val = uniforms.threshold / (f32(i) * 16384.0);
        debanded = mix(avg.avg, debanded, vec3<f32>(diff > vec3<f32>(comp_val)));
    }

    var noise = vec3(0.0);
    noise.x = rand(h); h = permute(h);
    noise.y = rand(h); h = permute(h);
    noise.z = rand(h); h = permute(h);
    debanded += (uniforms.grain / 8192.0) * (noise - vec3(0.5));

    let rgb = ycbcr_to_rgb_rec709(debanded);

    textureStore(outputTexture, id.xy, vec4<f32>(rgb, sample.a));
}`)
            },
        })

        this.#sampler = this.device.createSampler({ minFilter: "linear", magFilter: "linear" })

        this.#uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.#uniformData = new Float32Array(4)
        this.#uniformData[0] = 64
        this.#uniformData[1] = 48
        this.#uniformData[2] = 15
        this.#uniformData[3] = 0

        this.#bindgroup_uniforms = this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: this.#uniformBuffer }]
        })
    }

    #compute_x
    #compute_y
    #tex1_res
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
            console.log("Recreating bind group")
            this.#tex1 = tex1
            this.#tex2 = tex2
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex1 },
                    { binding: 1, resource: tex2 },
                    { binding: 2, resource: this.#sampler },
                ]
            })
        }

        this.#uniformData[3] = video_time
        this.device.queue.writeBuffer(this.#uniformBuffer, 0, this.#uniformData)

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.setBindGroup(1, this.#bindgroup_uniforms)
        pass.dispatchWorkgroups(this.#compute_x, this.#compute_y)
        pass.end()

        return [tex2, tex1_res]
    }
}
