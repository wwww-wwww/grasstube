import EffectSampler from "./_sampler"
import Effect from "../effects/_effect"

class EffectLinear extends Effect {
    create_settings(el) {
        el.parentElement.removeChild(el)
    }

    #pipeline
    init() {
        super.init()

        this.#pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

fn to_linear_fast(srgb: vec3<f32>) -> vec3<f32> {
    return pow(max(srgb, vec3<f32>(0.0)), vec3<f32>(2.2));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(inputTexture);

    if (id.x >= size.x || id.y >= size.y) { return; }

    let sample = textureLoad(inputTexture, id.xy, 0);
    let linear = to_linear_fast(sample.rgb);

    textureStore(outputTexture, id.xy, vec4<f32>(linear, sample.a));
}`)
            },
        })
    }

    resize(w, h) { }

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
        pass.dispatchWorkgroups(this.#compute_x, this.#compute_y)
        pass.end()

        return [tex2, tex1_res]
    }
}

export default class SamplerDefaultLinear extends EffectSampler {
    #pipeline
    #sampler
    #linear
    init() {
        this.#linear = new EffectLinear(this.renderer)
        this.#linear.init()

        this.#pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(1) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

fn to_srgb_fast(linear: vec3<f32>) -> vec3<f32> {
    return pow(max(linear, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let textureSize = vec2<f32>(textureDimensions(tex));
    let canvasSize = textureDimensions(outputTexture);

    if (id.x >= canvasSize.x || id.y >= canvasSize.y) {
        return;
    }

    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(canvasSize);

    let color = textureSampleLevel(tex, samp, uv, 0.0);
    let srgb = to_srgb_fast(color.rgb);

    textureStore(outputTexture, id.xy, vec4(srgb, color.a));
}`)
            },
        })

        this.#sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        })
    }

    create_settings(el) { }

    reset() {
        this.#tex1 = null
    }

    #compute_x
    #compute_y
    #tex_out_res
    #tex1
    #bindgroup
    run(encoder, video_time, tex_in, tex_in_res, tex_out, tex_out_res) {
        const [tex1, tex1_res] = this.#linear.run(encoder, video_time, tex_in, tex_in_res)

        if (this.#tex_out_res != tex_out_res) {
            this.#tex_out_res = tex_out_res
            this.#compute_x = Math.ceil(tex_out_res[0] / 16)
            this.#compute_y = Math.ceil(tex_out_res[1] / 16)
        }

        if (this.#tex1 != tex1) {
            console.log("Recreating bind group")
            this.#tex1 = tex1
            this.desc = { label: `${this.constructor.name} (${tex1_res}->${tex_out_res})` }
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex1 },
                    { binding: 1, resource: this.#sampler },
                ]
            })
        }

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.setBindGroup(1, this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: tex_out }]
        }))
        pass.dispatchWorkgroups(this.#compute_x, this.#compute_y)
        pass.end()
    }
}
