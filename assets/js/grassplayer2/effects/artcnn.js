import Effect from "./_effect"

import pass1 from "./artcnn_wgsl/01_rgb_to_yuv.wgsl"
import pass2 from "./artcnn_wgsl/02_conv2d.wgsl"
import pass3 from "./artcnn_wgsl/03_conv2d_1.wgsl"
import pass4 from "./artcnn_wgsl/04_conv2d_2.wgsl"
import pass5 from "./artcnn_wgsl/05_conv2d_3.wgsl"
import pass6 from "./artcnn_wgsl/06_conv2d_4.wgsl"
import pass7 from "./artcnn_wgsl/07_conv2d_5.wgsl"
import pass8 from "./artcnn_wgsl/08_conv2d_6.wgsl"
import pass9 from "./artcnn_wgsl/09_pass_9.wgsl"

export default class EffectArt extends Effect {
    #txt_dims
    create_settings(el) {
        el.innerHTML = `
<div><span>Doubled resolution</span><span class="dims"></span></div>
`
        this.#txt_dims = el.querySelector(".dims")
    }

    #pipelines
    #sampler
    init() {
        super.init()

        this.#pipelines = [pass1, pass2, pass3, pass4, pass5, pass6, pass7, pass8, pass9]
            .map(c => this.device.createComputePipeline({
                layout: "auto",
                entryPoint: "main",
                compute: { module: this.create_shader(c) },
            }))

        this.#sampler = this.device.createSampler({ minFilter: "linear", magFilter: "linear" })
    }

    #bindgroups = []
    #descriptions = []
    #resolutions = []
    #create_bindgroup(i, label, resolution, resources) {
        this.#descriptions[i] = { label: `${this.constructor.name} ${label}` }
        this.#bindgroups[i] = this.device.createBindGroup({
            layout: this.#pipelines[i].getBindGroupLayout(0),
            entries: resources.map((v, i) => { return { binding: i, resource: v } })
        })
        this.#resolutions[i] = resolution
    }

    #pass(encoder, i) {
        const pass = encoder.beginComputePass(this.#descriptions[i])
        pass.setPipeline(this.#pipelines[i])
        pass.setBindGroup(0, this.#bindgroups[i])
        let x = Math.ceil(this.#resolutions[i][0] / 16)
        let y = Math.ceil(this.#resolutions[i][1] / 16)
        pass.dispatchWorkgroups(x, y)
        pass.end()
    }

    #tex_in
    run(encoder, video_time, tex_in, tex_in_res) {
        const tex_yuv = this.get_texture(tex_in_res, [tex_in])
        const tex2_x1 = this.get_texture(tex_in_res, [tex_in, tex_yuv])

        const tex2_res = [tex_in_res[0] * 2, tex_in_res[1] * 2]
        const tex2_x2_0 = this.get_texture(tex2_res)
        const tex2_x2_1 = this.get_texture(tex2_res, [tex2_x2_0])
        const tex2_x2_2 = this.get_texture(tex2_res, [tex2_x2_0, tex2_x2_1])

        if (this.#tex_in != tex_in) {
            this.#tex_in = tex_in
            console.log("Recreating bind group")

            this.#txt_dims.textContent = `${tex2_res[0]}x${tex2_res[1]}`

            this.#create_bindgroup(0, "yuv", tex_in_res, [tex_in, tex_yuv])
            this.#create_bindgroup(1, "conv2d", tex_in_res, [tex_yuv, tex2_x2_0])
            this.#create_bindgroup(2, "conv2d_1", tex_in_res, [tex2_x2_0, tex2_x2_1])
            this.#create_bindgroup(3, "conv2d_2", tex_in_res, [tex2_x2_1, tex2_x2_2])
            this.#create_bindgroup(4, "conv2d_3", tex_in_res, [tex2_x2_2, tex2_x2_1])
            this.#create_bindgroup(5, "conv2d_4", tex_in_res, [tex2_x2_1, tex2_x2_2])
            this.#create_bindgroup(6, "conv2d_5", tex_in_res, [tex2_x2_2, tex2_x2_1])
            this.#create_bindgroup(7, "conv2d_6", tex_in_res, [tex2_x2_1, tex2_x2_0, tex2_x1])
            this.#create_bindgroup(8, "rgb", tex2_res, [tex_yuv, tex2_x1, tex2_x2_1, this.#sampler])
        }

        for (let i = 0; i < 9; i++) {
            this.#pass(encoder, i)
        }

        return [tex2_x2_1, tex2_res]
    }
}
