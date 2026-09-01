import Effect from "./_effect"
import { FULLSCREEN_VERTEX, FullscreenTarget, create_fullscreen_pipeline } from "./_fullscreen"

export default class EffectDehalo extends Effect {
    enabled = true
    #uniformData = new ArrayBuffer(16)

    create_settings(root) {
        root.innerHTML = `
<div><span>Bright strength</span><button name="strength1" class="reset"></button><input name="strength1" type="number" value="50" max="100" min="0"/></div>
<div><span>Dark strength</span><button name="strength2" class="reset"></button><input name="strength2" type="number" value="20" max="100" min="0"/></div>
<div><span>t</span><button name="tightness" class="reset"></button><input name="tightness" type="number" value="4" max="10" min="0"/></div>
<div><span>Radius</span><button name="radius" class="reset"></button><input name="radius" type="number" value="2" max="20" min="1"/></div>
`

        const view = new DataView(this.#uniformData)

        Array.from([
            ["strength1", 0.5, 100],
            ["strength2", 0.2, 100],
            ["tightness", 0.4, 10],
            ["radius", 2, 1],
        ]).forEach(([name, def, scale], i) => {
            const val = parseInt(this.get_storage(name) || def * scale)

            const update = t => {
                if (scale == 1) {
                    view.setInt32(i * 4, t / scale, true)
                } else {
                    view.setFloat32(i * 4, t / scale, true)
                }
                if (this.#uniformBuffer == null) return

                this.device.queue.writeBuffer(this.#uniformBuffer, 0, this.#uniformData)
                this.on_update()
            }

            update(val)

            const el = root.querySelector(`input[name="${name}"]`)
            el.value = val
            el.addEventListener("input", () => {
                update(el.value)
                this.set_storage(name, el.value)
            })

            root.querySelector(`button[name="${name}"]`).addEventListener("click", () => {
                el.value = def * scale
                update(el.value)
                this.set_storage(name, el.value)
            })
        })
    }

    #pipeline
    #uniformBuffer = null
    #bindgroup_uniforms
    init() {
        super.init()

        // Deliberately a plain per-pixel gather rather than a workgroup-tiled compute shader.
        // Staging the (16+2r)^2 apron in workgroup storage cuts the texture fetches by ~16x on
        // paper, but measured against this shader it was 40-50% *slower* at every radius from 1
        // to 8: the neighbourhood is small enough that the texture cache already supplies the
        // reuse, so the tile only adds shared-memory traffic, a barrier and lower occupancy.
        this.#pipeline = create_fullscreen_pipeline(
            this.device,
            this.create_shader(/* wgsl */ `
struct Params {
    bright_strength: f32,
    dark_strength: f32,
    tightness: f32,
    radius: i32,
}

@group(0) @binding(0) var input_tex: texture_2d<f32>;
@group(1) @binding(0) var<uniform> params: Params;
${FULLSCREEN_VERTEX}
@fragment
fn fs_main(in: FsVertexOutput) -> @location(0) vec4<f32> {
    let coords = vec2<i32>(in.pos.xy);
    let dims = vec2<i32>(textureDimensions(input_tex));

    let center_pixel = textureLoad(input_tex, coords, 0);
    let center = center_pixel.rgb;

    // Alpha is passed straight through, so the neighbourhood only needs rgb.
    var min_color = vec3<f32>(1e10);
    var max_color = vec3<f32>(-1e10);
    var sum_color = vec3<f32>(0.0);
    var count = 0.0;

    for (var y: i32 = -params.radius; y <= params.radius; y++) {
        for (var x: i32 = -params.radius; x <= params.radius; x++) {
            if (x == 0 && y == 0) { continue; }

            let sample_coords = clamp(coords + vec2<i32>(x, y), vec2<i32>(0), dims - vec2<i32>(1));
            let neighbor = textureLoad(input_tex, sample_coords, 0).rgb;

            min_color = min(min_color, neighbor);
            max_color = max(max_color, neighbor);
            sum_color += neighbor;
            count += 1.0;
        }
    }

    let avg_color = sum_color / count;

    let limit_high = mix(max_color, avg_color, params.tightness);
    let limit_low = mix(min_color, avg_color, params.tightness);

    let dark_corrected = mix(center, max(center, limit_low), params.dark_strength);
    let bright_corrected = mix(center, min(center, limit_high), params.bright_strength);

    var result = select(center, dark_corrected, center < limit_low);
    result = select(result, bright_corrected, center > limit_high);

    return vec4<f32>(result, center_pixel.a);
}`),
            "rgba16float",
            this.constructor.name,
        )

        this.#uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.device.queue.writeBuffer(this.#uniformBuffer, 0, this.#uniformData)

        this.#bindgroup_uniforms = this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: this.#uniformBuffer } }],
        })
    }

    #tex1
    #bindgroup
    #target = new FullscreenTarget(this.constructor.name)
    run(encoder, video_time, tex1, tex1_res) {
        const tex2 = this.get_texture(tex1_res, [tex1])

        if (this.#tex1 != tex1) {
            console.log("Recreating bind group")
            this.#tex1 = tex1
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: tex1 }],
            })
        }

        const pass = this.#target.begin(encoder, tex2)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.setBindGroup(1, this.#bindgroup_uniforms)
        pass.draw(3)
        pass.end()

        return [tex2, tex1_res]
    }
}
