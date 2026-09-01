// Shared fullscreen-triangle vertex stage for the passes that run as fragment shaders.
//
// Measured on the filter chain (see the notes in rendererwebgpu.ts): passes whose cost is dominated
// by writing a full-resolution image are markedly faster as a render pass than as a compute
// dispatch with textureStore, because the colour attachment write goes through the ROP and keeps
// framebuffer compression. At 3840x2160 a pointwise pass measured 0.060 ms as a fragment shader
// against 0.160 ms as a compute dispatch, and that gap did not move with the workgroup shape.
//
// Interpolated at pixel centres, `uv` is exactly (id + 0.5) / target_size, and
// vec2<i32>(pos.xy) is exactly the integer pixel coordinate a compute invocation would have had.
export const FULLSCREEN_VERTEX = /* wgsl */ `
struct FsVertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> FsVertexOutput {
    let xy = vec2<f32>(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0);

    var out: FsVertexOutput;
    out.pos = vec4<f32>(xy, 0.0, 1.0);
    out.uv = vec2<f32>(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
    return out;
}
`

export function create_fullscreen_pipeline(device, module, format, label) {
    return device.createRenderPipeline({
        label,
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    })
}

/**
 * A reusable render pass descriptor. The triangle covers every pixel of the target, so the pass
 * always clears rather than loads and the driver never has to fetch the previous contents.
 */
export class FullscreenTarget {
    attachment = { view: null, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }
    desc

    constructor(label) {
        this.desc = { label, colorAttachments: [this.attachment] }
    }

    begin(encoder, view) {
        this.attachment.view = view
        return encoder.beginRenderPass(this.desc)
    }
}
