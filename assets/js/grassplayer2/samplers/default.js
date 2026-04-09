import EffectSampler from "./_sampler"

class BasicComputeSampler extends EffectSampler {
    #pipeline
    #sampler
    init() {
        this.#sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        })
        this.#pipeline = this.pipeline()
    }

    reset() {
        this.#tex1 = null
    }

    #compute_x
    #compute_y
    #tex2_res
    #tex1
    #bindgroup
    run(encoder, t, video_time, tex1_res, tex1, tex2_res, tex2) {
        if (this.#tex2_res != tex2_res) {
            this.#tex2_res = tex2_res
            this.#compute_x = Math.ceil(this.canvas.width / 16)
            this.#compute_y = Math.ceil(this.canvas.height / 16)
        }

        if (this.#tex1 != tex1) {
            console.log("Recreating bind group")
            this.#tex1 = tex1
            this.desc = { label: `${this.constructor.name} (${tex1_res}->${tex2_res})` }
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex1 },
                    { binding: 1, resource: this.#sampler },
                ]
            })
        }

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.setBindGroup(1, this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: tex2 }]
        }))
        pass.dispatchWorkgroups(this.#compute_x, this.#compute_y)
        pass.end()
    }
}

class SamplerHermite extends BasicComputeSampler {
    create_settings(el) { }

    pipeline() {
        return this.device.createComputePipeline({
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

    let pt = 1.0 / textureSize;
    let frac_val = fract(uv * textureSize + vec2f(0.5));
    let pos = uv + pt * (smoothstep(vec2f(0.0), vec2f(1.0), frac_val) - frac_val);
    let color = textureSampleBaseClampToEdge(tex, samp, pos);

    textureStore(outputTexture, id.xy, color);
}`)
            },
        })
    }
}

class SamplerDefault extends BasicComputeSampler {
    create_settings(el) { }

    pipeline() {
        return this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(1) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

fn to_srgb_fast(linear: vec3<f32>) -> vec3<f32> {
    return pow(max(linear, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
}

fn to_linear_fast(srgb: vec3<f32>) -> vec3<f32> {
    return pow(max(srgb, vec3<f32>(0.0)), vec3<f32>(2.2));
}

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
    // srgb = to_srgb_fast(color.rgb);

    textureStore(outputTexture, id.xy, vec4(srgb, color.a));
}`)
            },
        })
    }
}

class SamplerDefaultLinear extends BasicComputeSampler {
    create_settings(el) { }

    pipeline() {
        return this.device.createComputePipeline({
            layout: "auto",
            compute: {
                module: this.create_shader(/* wgsl */`
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(1) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

fn to_srgb_fast(linear: vec3<f32>) -> vec3<f32> {
    return pow(max(linear, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let textureSize = vec2<f32>(textureDimensions(tex));
    let canvasSize = textureDimensions(outputTexture);

    if (id.x >= canvasSize.x || id.y >= canvasSize.y) {
        return;
    }

    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(canvasSize);

    let color = textureSampleLevel(tex, samp, uv, 0.0);
    let srgb = to_srgb_fast(color.rgb);

    textureStore(outputTexture, id.xy, vec4(srgb, color.a));
}`)
            },
        })
    }
}

export { SamplerDefault, SamplerDefaultLinear, SamplerHermite }
