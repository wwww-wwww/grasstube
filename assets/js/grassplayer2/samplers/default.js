import EffectSampler from "./_sampler"

export default class SamplerDefault extends EffectSampler {
    #pipeline
    #sampler
    init() {
        this.#pipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(1) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let textureSize = vec2<f32>(textureDimensions(tex));
    let canvasSize = textureDimensions(outputTexture);

    if (id.x >= canvasSize.x || id.y >= canvasSize.y) {
        return;
    }

    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(canvasSize);

    let color = textureSampleLevel(tex, samp, uv, 0.0);
    var srgb = color.rgb;

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
        this.#tex_in = null
    }

    #compute_x
    #compute_y
    #tex_out_res
    #tex_in
    #bindgroup
    run(encoder, video_time, tex_in, tex_in_res, tex_out, tex_out_res) {
        if (this.#tex_out_res != tex_out_res) {
            this.#tex_out_res = tex_out_res
            this.#compute_x = Math.ceil(tex_out_res[0] / 16)
            this.#compute_y = Math.ceil(tex_out_res[1] / 16)
        }

        if (this.#tex_in != tex_in) {
            console.log("Recreating bind group")
            this.#tex_in = tex_in
            this.desc = { label: `${this.constructor.name} (${tex_in_res}->${tex_out_res})` }
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex_in },
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
