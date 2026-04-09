import Effect from "./_effect"

export default class EffectLoad extends Effect {
    enabled = true
    force = true
    #pipeline
    #bindgroup
    init() {
        super.init()

        this.#pipeline = this.device.createComputePipeline({
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
    }

    create_settings(el) {
        el.parentElement.removeChild(el)
    }

    resize(w, h) { }

    #compute_x
    #compute_y
    #tex1_res
    #tex2
    run(encoder, t, video_time, tex1_res, tex1, get_texture) {
        if (this.#tex1_res != tex1_res) {
            this.#compute_x = Math.ceil(tex1_res[0] / 16)
            this.#compute_y = Math.ceil(tex1_res[1] / 16)
            this.#tex1_res = tex1_res
        }
        const tex2 = get_texture(tex1_res)

        if (this.#tex2 != tex2) {
            console.log("Recreating bind group")
            this.#tex2 = tex2
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(1),
                entries: [{ binding: 0, resource: tex2 }]
            })
        }

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: tex1 }]
        }))
        pass.setBindGroup(1, this.#bindgroup)
        pass.dispatchWorkgroups(this.#compute_x, this.#compute_y)
        pass.end()

        return [tex2, tex1_res]
    }
}
