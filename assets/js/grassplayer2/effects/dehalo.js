import Effect from "./_effect"

export default class EffectDehalo extends Effect {
    enabled = true
    create_settings(el) {
        el.innerHTML = `
<div><span>Bright strength</span><input class="input-strength1" type="number" value="50" max="100" min="0"/></div>
<div><span>Dark strength</span><input class="input-strength2" type="number" value="20" max="100" min="0"/></div>
<div><span>t</span><input class="input-t" type="number" value="4" max="10" min="0"/></div>
<div><span>Radius</span><input class="input-radius" type="number" value="2" max="20" min="1"/></div>
`
        const data = new ArrayBuffer(16)
        const view = new DataView(data)
        view.setFloat32(0, .5, true)
        view.setFloat32(4, .2, true)
        view.setFloat32(8, .4, true)
        view.setInt32(12, 2, true)
        el.querySelector(".input-strength1").addEventListener("input", e => {
            view.setFloat32(0, parseInt(e.target.value) / 100, true)

            this.device.queue.writeBuffer(this.#uniformBuffer, 0, data)
            this.on_update()
        })
        el.querySelector(".input-strength2").addEventListener("input", e => {
            view.setFloat32(4, parseInt(e.target.value) / 100, true)

            this.device.queue.writeBuffer(this.#uniformBuffer, 0, data)
            this.on_update()
        })
        el.querySelector(".input-t").addEventListener("input", e => {
            view.setFloat32(8, parseInt(e.target.value) / 10, true)

            this.device.queue.writeBuffer(this.#uniformBuffer, 0, data)
            this.on_update()
        })
        el.querySelector(".input-radius").addEventListener("input", e => {
            view.setInt32(12, parseInt(e.target.value), true);

            this.device.queue.writeBuffer(this.#uniformBuffer, 0, data)
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
struct Params {
    bright_strength: f32,
    dark_strength: f32,
    tightness: f32,
    radius: i32,
}

@group(0) @binding(0) var input_tex: texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba16float, write>;
@group(1) @binding(0) var<uniform> params: Params;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let coords = vec2<i32>(id.xy);
    let dims = textureDimensions(input_tex);

    if (id.x >= dims.x || id.y >= dims.y) { return; }

    let center_pixel = textureLoad(input_tex, coords, 0);
    
    var min_color = vec4<f32>(1e10);
    var max_color = vec4<f32>(-1e10);
    var sum_color = vec4<f32>(0.0);
    var count = 0.0;

    for (var y: i32 = -params.radius; y <= params.radius; y++) {
        for (var x: i32 = -params.radius; x <= params.radius; x++) {
            if (x == 0 && y == 0) { continue; }

            let sample_coords = clamp(coords + vec2<i32>(x, y), vec2<i32>(0), vec2<i32>(dims) - vec2<i32>(1));
            let neighbor = textureLoad(input_tex, sample_coords, 0);

            min_color = min(min_color, neighbor);
            max_color = max(max_color, neighbor);
            sum_color += neighbor;
            count += 1.0;
        }
    }

    let avg_color = sum_color / count;

    let limit_high = mix(max_color, avg_color, params.tightness);
    let limit_low = mix(min_color, avg_color, params.tightness);

    var result = center_pixel;

    let dark_clamped = max(center_pixel, limit_low);
    let dark_corrected = mix(center_pixel, dark_clamped, params.dark_strength);

    let bright_clamped = min(center_pixel, limit_high);
    let bright_corrected = mix(center_pixel, bright_clamped, params.bright_strength);

    result.r = select(result.r, dark_corrected.r, center_pixel.r < limit_low.r);
    result.r = select(result.r, bright_corrected.r, center_pixel.r > limit_high.r);
    
    result.g = select(result.g, dark_corrected.g, center_pixel.g < limit_low.g);
    result.g = select(result.g, bright_corrected.g, center_pixel.g > limit_high.g);
    
    result.b = select(result.b, dark_corrected.b, center_pixel.b < limit_low.b);
    result.b = select(result.b, bright_corrected.b, center_pixel.b > limit_high.b);

    textureStore(output_tex, coords, vec4<f32>(result.rgb, center_pixel.a));
}`)
            },
        })

        this.#uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

        const data = new ArrayBuffer(16)
        const view = new DataView(data)

        view.setFloat32(0, .5, true)
        view.setFloat32(4, .2, true)
        view.setFloat32(8, .4, true)
        view.setInt32(12, 2, true)

        this.#bindgroup_uniforms = this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: this.#uniformBuffer }]
        })
        this.device.queue.writeBuffer(this.#uniformBuffer, 0, data)
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
                ]
            })
        }

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.setBindGroup(1, this.#bindgroup_uniforms)
        pass.dispatchWorkgroups(this.#compute_x, this.#compute_y)
        pass.end()

        return [tex2, tex1_res]
    }
}
