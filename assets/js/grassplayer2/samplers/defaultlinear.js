import EffectSampler from "./_sampler"
import {
    FULLSCREEN_VERTEX,
    FullscreenTarget,
    create_fullscreen_pipeline,
} from "../effects/_fullscreen"

const GAMMA = /* wgsl */ `
fn to_linear_fast(srgb: vec3<f32>) -> vec3<f32> {
    return pow(max(srgb, vec3<f32>(0.0)), vec3<f32>(2.2));
}

fn to_srgb_fast(linear: vec3<f32>) -> vec3<f32> {
    return pow(max(linear, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
}
`

/**
 * Resamples in linear light, but only when that actually buys anything: when the source is larger
 * than the target and texels are being averaged together. Blending in gamma space is what shifts
 * brightness there, and after ArtCNN the source is twice the canvas in both axes, so this is the
 * common case.
 *
 * When magnifying or at 1:1 there is nothing to average - bilinear is interpolating between two
 * adjacent texels, or landing exactly on one - so the pass drops the conversion entirely and takes
 * a single hardware-filtered tap. That skips two pow(vec3) round trips per pixel over the whole
 * canvas and, since the source is the smaller image, is exactly where the extra work would have
 * been spread over the most output pixels.
 */
export default class SamplerDefaultLinear extends EffectSampler {
    // Minifying: manual 4-tap bilinear that linearises each texel itself. Same weights as the
    // hardware would use, so the same result, without needing a full-resolution linearisation pass
    // in front of it.
    #pipeline_linear
    // Magnifying / 1:1: plain filtered tap, no gamma work at all.
    #pipeline_direct
    #sampler

    init() {
        super.init()

        const format = this.renderer.canvas_format

        const direct = this.create_shader(/* wgsl */ `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
${FULLSCREEN_VERTEX}
@fragment
fn fs_main(in: FsVertexOutput) -> @location(0) vec4<f32> {
    return textureSample(tex, samp, in.uv);
}`)

        const linear = this.create_shader(/* wgsl */ `
@group(0) @binding(0) var tex: texture_2d<f32>;
${FULLSCREEN_VERTEX}
${GAMMA}
@fragment
fn fs_main(in: FsVertexOutput) -> @location(0) vec4<f32> {
    let size = vec2<i32>(textureDimensions(tex));
    let p = in.uv * vec2<f32>(size) - 0.5;
    let base = floor(p);
    let f = p - base;

    // clamp-to-edge, matching the sampler the direct path uses
    let i0 = clamp(vec2<i32>(base), vec2<i32>(0), size - 1);
    let i1 = clamp(vec2<i32>(base) + 1, vec2<i32>(0), size - 1);

    let t00 = textureLoad(tex, vec2<i32>(i0.x, i0.y), 0);
    let t10 = textureLoad(tex, vec2<i32>(i1.x, i0.y), 0);
    let t01 = textureLoad(tex, vec2<i32>(i0.x, i1.y), 0);
    let t11 = textureLoad(tex, vec2<i32>(i1.x, i1.y), 0);

    let c0 = mix(vec4<f32>(to_linear_fast(t00.rgb), t00.a),
                 vec4<f32>(to_linear_fast(t10.rgb), t10.a), f.x);
    let c1 = mix(vec4<f32>(to_linear_fast(t01.rgb), t01.a),
                 vec4<f32>(to_linear_fast(t11.rgb), t11.a), f.x);
    let c = mix(c0, c1, f.y);

    return vec4<f32>(to_srgb_fast(c.rgb), c.a);
}`)

        this.#pipeline_direct = create_fullscreen_pipeline(
            this.device,
            direct,
            format,
            `${this.constructor.name} direct`,
        )
        this.#pipeline_linear = create_fullscreen_pipeline(
            this.device,
            linear,
            format,
            `${this.constructor.name} linear`,
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
    #downsampling
    #bindgroup
    #target = new FullscreenTarget("")

    run(encoder, video_time, tex_in, tex_in_res, tex_out, tex_out_res) {
        // Strictly larger in either axis: texels are being combined, so the blend happens in
        // linear light. Equal or smaller means no averaging, and the conversion is skipped.
        const downsampling = tex_in_res[0] > tex_out_res[0] || tex_in_res[1] > tex_out_res[1]

        if (this.#tex_in != tex_in || this.#downsampling != downsampling) {
            console.log("Recreating bind group")
            this.#tex_in = tex_in
            this.#downsampling = downsampling

            this.#target.desc.label =
                `${this.constructor.name} ${downsampling ? "linear" : "direct"} ` +
                `(${tex_in_res}->${tex_out_res})`

            const entries = [{ binding: 0, resource: tex_in }]
            if (!downsampling) entries.push({ binding: 1, resource: this.#sampler })

            this.#bindgroup = this.device.createBindGroup({
                layout: (downsampling ?
                    this.#pipeline_linear
                :   this.#pipeline_direct
                ).getBindGroupLayout(0),
                entries,
            })
        }

        const pass = this.#target.begin(encoder, tex_out)
        pass.setPipeline(downsampling ? this.#pipeline_linear : this.#pipeline_direct)
        pass.setBindGroup(0, this.#bindgroup)
        pass.draw(3)
        pass.end()
    }
}
