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

    width
    height
    resize(width, height) {
        this.width = width
        this.height = height

        this.#txt_dims.textContent = `${width * 2}x${height * 2}`

        const t1 = performance.now()

        {
            const x = Math.ceil(width / 16)
            const y = Math.ceil(height / 16)
            if (this.tex1_x == x && this.tex1_y == y) return;
            this.tex1_x = x
            this.tex1_y = y
        }

        this.tex2_x = Math.ceil(width * 2 / 16)
        this.tex2_y = Math.ceil(height * 2 / 16)
    }

    #bindgroups
    pass(label, encoder, i, x, y) {
        const pass = encoder.beginComputePass({ label: `${this.constructor.name} ${label}` })
        pass.setPipeline(this.#pipelines[i])
        pass.setBindGroup(0, this.#bindgroups[i])
        pass.dispatchWorkgroups(x, y)
        pass.end()
    }

    #tex1
    run(encoder, t, video_time, tex1_res, tex1, get_texture) {
        const tex2_res = [tex1_res[0] * 2, tex1_res[1] * 2]

        const tex_yuv = get_texture(tex1_res, [tex1])
        const tex2_x1 = get_texture(tex1_res, [tex1, tex_yuv])
        const tex2_x2_0 = get_texture(tex2_res)
        const tex2_x2_1 = get_texture(tex2_res, [tex2_x2_0])
        const tex2_x2_2 = get_texture(tex2_res, [tex2_x2_0, tex2_x2_1])

        if (this.#tex1 != tex1) {
            console.log("Recreating bind group")
            this.#tex1 = tex1
            this.#bindgroups = [
                this.device.createBindGroup({
                    layout: this.#pipelines[0].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex1 },
                        { binding: 1, resource: tex_yuv },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[1].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex_yuv },
                        { binding: 1, resource: tex2_x2_0 },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[2].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex2_x2_0 },
                        { binding: 1, resource: tex2_x2_1 },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[3].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex2_x2_1 },
                        { binding: 1, resource: tex2_x2_2 },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[4].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex2_x2_2 },
                        { binding: 1, resource: tex2_x2_1 },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[5].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex2_x2_1 },
                        { binding: 1, resource: tex2_x2_2 },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[6].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex2_x2_2 },
                        { binding: 1, resource: tex2_x2_1 },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[7].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex2_x2_1 },
                        { binding: 1, resource: tex2_x2_0 },
                        { binding: 2, resource: tex2_x1 },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.#pipelines[8].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: tex_yuv },
                        { binding: 1, resource: tex2_x1 },
                        { binding: 2, resource: tex2_x2_1 },
                        { binding: 3, resource: this.#sampler },
                    ]
                }),
            ]
        }

        this.pass("yuv", encoder, 0, this.tex1_x, this.tex1_y)
        this.pass("conv2d", encoder, 1, this.tex1_x, this.tex1_y)
        this.pass("conv2d_1", encoder, 2, this.tex1_x, this.tex1_y)
        this.pass("conv2d_2", encoder, 3, this.tex1_x, this.tex1_y)
        this.pass("conv2d_3", encoder, 4, this.tex1_x, this.tex1_y)
        this.pass("conv2d_4", encoder, 5, this.tex1_x, this.tex1_y)
        this.pass("conv2d_5", encoder, 6, this.tex1_x, this.tex1_y)
        this.pass("conv2d_6", encoder, 7, this.tex1_x, this.tex1_y)
        this.pass("rgb", encoder, 8, this.tex2_x, this.tex2_y)

        return [tex2_x2_1, tex2_res]
    }
}
