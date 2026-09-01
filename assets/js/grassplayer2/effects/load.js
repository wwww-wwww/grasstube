import Effect from "./_effect"
import { FULLSCREEN_VERTEX, FullscreenTarget, create_fullscreen_pipeline } from "./_fullscreen"

export default class EffectLoad extends Effect {
    enabled = true
    force = true

    #pipeline
    init() {
        super.init()

        this.#pipeline = create_fullscreen_pipeline(
            this.device,
            this.create_shader(/* wgsl */ `
@group(0) @binding(0) var inputVideo: texture_external;
${FULLSCREEN_VERTEX}
@fragment
fn fs_main(in: FsVertexOutput) -> @location(0) vec4<f32> {
    return textureLoad(inputVideo, vec2<i32>(in.pos.xy));
}`),
            "rgba16float",
            this.constructor.name,
        )
    }

    create_settings(el) {
        el.parentElement.removeChild(el)
    }

    #target = new FullscreenTarget(this.constructor.name)
    run(encoder, video_time, tex1, tex1_res) {
        const tex2 = this.get_texture(tex1_res)

        // An imported external texture expires with the frame it came from, so its bind group
        // cannot be cached across frames the way every other pass caches its own.
        const bindgroup = this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: tex1 }],
        })

        const pass = this.#target.begin(encoder, tex2)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, bindgroup)
        pass.draw(3)
        pass.end()

        return [tex2, tex1_res]
    }
}
