import { EffectSampler, SamplerDefault, SamplerHermite } from "./samplers"

import pass1 from "./artcnn_wgsl/01_rgb_to_yuv.wgsl"
import pass2 from "./artcnn_wgsl/02_conv2d.wgsl"
import pass3 from "./artcnn_wgsl/03_conv2d_1.wgsl"
import pass4 from "./artcnn_wgsl/04_conv2d_2.wgsl"
import pass5 from "./artcnn_wgsl/05_conv2d_3.wgsl"
import pass6 from "./artcnn_wgsl/06_conv2d_4.wgsl"
import pass7 from "./artcnn_wgsl/07_conv2d_5.wgsl"
import pass8 from "./artcnn_wgsl/08_conv2d_6.wgsl"
import pass9 from "./artcnn_wgsl/09_pass_9.wgsl"

export default class SamplerArt extends EffectSampler {
    constructor(device, video, canvas) {
        super(device, video, canvas)
        this.downsamplers = [
            new SamplerDefault(device, video, canvas),
            new SamplerHermite(device, video, canvas)
        ]
        this.downsampler = this.downsamplers[0]
        this.width = null
        this.height = null
    }
    create_settings(el) {
        el.innerHTML = `
<div><span>Doubled resolution</span><span class="dims"></span></div>
<div><span>Downsampler</span><select class="select-artcnn-downsampler"></select></div>
`
        this.txt_dims = el.querySelector(".dims")
        const select = el.querySelector(".select-artcnn-downsampler")

        this.downsamplers.forEach(e => {
            const option = document.createElement("option")
            option.textContent = e.constructor.name
            select.appendChild(option)
        })

        select.addEventListener("change", () => {
            // while (div.firstChild) { div.removeChild(div.firstChild) }
            // this.downsamplers[select.selectedIndex].create_settings(div)
            this.downsamplers[select.selectedIndex].init()
            this.downsampler = this.downsamplers[select.selectedIndex]
            this.resize(this.width, this.height)
        })
    }
    init() {
        this.downsampler.init()

        const t1 = performance.now()

        this.pipelines = [pass1, pass2, pass3, pass4, pass5, pass6, pass7, pass8, pass9]
            .map(c => this.device.createComputePipeline({
                layout: "auto",
                entryPoint: "main",
                compute: { module: this.create_shader(c) },
            }))

        console.log(`created shaders ${performance.now() - t1}`)

        this.sampler = this.device.createSampler({ minFilter: "linear", magFilter: "linear" })

        this.texture1 = null
        this.bindgroups = null
    }
    resize(width, height) {
        this.width = width
        this.height = height
        this.downsampler.resize(width, height)

        this.skip = (this.canvas.width / width) < 1.3
        if (this.skip) {
            this.txt_dims.textContent = "Skip"
            console.log("resolution too small, skipping")
            return
        }
        this.txt_dims.textContent = `${width * 2}x${height * 2}`

        const t1 = performance.now()

        {
            const x = Math.ceil(width / 16)
            const y = Math.ceil(height / 16)
            if (this.tex1_x == x && this.tex1_y == y) return;
            this.tex1_x = x
            this.tex1_y = y
        }

        if (this.tex_yuv) {
            this.tex_yuv.destroy()
            this.tex1.destroy()
            this.tex_pass2.destroy()
            this.tex2.destroy()
            this.tex2_2.destroy()
        }

        this.tex_yuv = this.device.createTexture({
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        })
        this.tex_yuv_view = this.tex_yuv.createView()

        this.tex1 = this.device.createTexture({
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        })
        this.tex1_view = this.tex1.createView()

        this.tex2_x = Math.ceil(width * 2 / 16)
        this.tex2_y = Math.ceil(height * 2 / 16)

        this.tex_pass2 = this.device.createTexture({
            size: [width * 2, height * 2],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        })
        this.tex_pass2_view = this.tex_pass2.createView()

        this.tex2 = this.device.createTexture({
            size: [width * 2, height * 2],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        })
        this.tex2_view = this.tex2.createView()

        this.tex2_2 = this.device.createTexture({
            size: [width * 2, height * 2],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        })
        this.tex2_2_view = this.tex2_2.createView()

        console.log(`created textures ${performance.now() - t1}`)

        this.texture1 = null
        this.bindgroups = null
    }
    pass(label, encoder, i, x, y, bindgroup) {
        const pass = encoder.beginComputePass({ label: `${this.constructor.name} ${label}` })
        pass.setPipeline(this.pipelines[i])
        pass.setBindGroup(0, this.bindgroups[i])
        pass.dispatchWorkgroups(x, y)
        pass.end()
    }
    run(encoder, t, video_time, texture1, texture2) {
        if (this.skip) {
            this.downsampler.run(encoder, t, video_time, texture1, texture2)
            return
        }

        if (this.texture1 != texture1) {
            this.texture1 = texture1
            console.log("create bindgroups")
            this.bindgroups = [
                this.device.createBindGroup({
                    layout: this.pipelines[0].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: texture1 },
                        { binding: 1, resource: this.tex_yuv_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[1].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex_yuv_view },
                        { binding: 1, resource: this.tex_pass2_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[2].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex_pass2_view },
                        { binding: 1, resource: this.tex2_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[3].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex2_view },
                        { binding: 1, resource: this.tex2_2_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[4].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex2_2_view },
                        { binding: 1, resource: this.tex2_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[5].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex2_view },
                        { binding: 1, resource: this.tex2_2_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[6].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex2_2_view },
                        { binding: 1, resource: this.tex2_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[7].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex2_view },
                        { binding: 1, resource: this.tex_pass2 },
                        { binding: 2, resource: this.tex1_view },
                    ]
                }),
                this.device.createBindGroup({
                    layout: this.pipelines[8].getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.tex_yuv_view },
                        { binding: 1, resource: this.tex1_view },
                        { binding: 2, resource: this.tex2_view },
                        { binding: 3, resource: this.sampler },
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

        this.downsampler.run(encoder, t, video_time, this.tex2_view, texture2)
    }
}
