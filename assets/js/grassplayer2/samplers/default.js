import EffectSampler from "./_sampler"
import {
    FULLSCREEN_VERTEX,
    FullscreenTarget,
    create_fullscreen_pipeline,
} from "../effects/_fullscreen"

export default class SamplerDefault extends EffectSampler {
    #pipeline
    #sampler
    init() {
        super.init()

        // Fullscreen triangle instead of a compute dispatch: this writes the swap chain through
        // the render-attachment path (ROP + framebuffer compression) in whatever format the
        // compositor prefers, so there is no storage-binding requirement on the canvas and no
        // per-frame format conversion.
        const module = this.create_shader(/* wgsl */ `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
${FULLSCREEN_VERTEX}
@fragment
fn fs_main(in: FsVertexOutput) -> @location(0) vec4<f32> {
    return textureSample(tex, samp, in.uv);
}`)

        this.#pipeline = create_fullscreen_pipeline(
            this.device,
            module,
            this.renderer.canvas_format,
            this.constructor.name,
        )

        this.#sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge",
        })
    }

    create_settings(el) {}

    reset() {
        this.#tex_in = null
    }

    #tex_in
    #bindgroup
    #target = new FullscreenTarget("")

    run(encoder, video_time, tex_in, tex_in_res, tex_out, tex_out_res) {
        if (this.#tex_in != tex_in) {
            console.log("Recreating bind group")
            this.#tex_in = tex_in
            this.#target.desc.label = `${this.constructor.name} (${tex_in_res}->${tex_out_res})`
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex_in },
                    { binding: 1, resource: this.#sampler },
                ],
            })
        }

        const pass = this.#target.begin(encoder, tex_out)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.draw(3)
        pass.end()
    }
}
