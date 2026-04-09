import Effect from "./_effect"

export default class EffectLinear extends Effect {
    enabled = true
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

fn to_srgb_fast(linear: vec3<f32>) -> vec3<f32> {
    return pow(max(linear, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
}

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
    run(encoder, t, video_time, tex1_res, tex1, get_texture) {
        if (this.#tex1_res != tex1_res) {
            this.#compute_x = Math.ceil(tex1_res[0] / 16)
            this.#compute_y = Math.ceil(tex1_res[1] / 16)
            this.#tex1_res = tex1_res
        }

        const tex2 = get_texture(tex1_res, [tex1])

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
