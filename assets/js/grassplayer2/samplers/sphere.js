import EffectSampler from "./_sampler"

export default class SamplerSphere extends EffectSampler {
    #pipeline
    #sampler
    #uniformBuffer
    #uniformData
    init() {
        const shader = this.create_shader(/* wgsl */ `
struct Uniforms {
    aspect: f32,
    time: f32,
    padding1: f32, // Padding to meet 16-byte alignment rules
    padding2: f32,
}

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(1) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

const PI: f32 = 3.14159265359;

@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32) -> VertexOutput {
    // Draw a single massive triangle that covers the whole screen
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );
    var out: VertexOutput;
    out.clip_position = vec4<f32>(pos[vIdx], 0.0, 1.0);
    out.uv = pos[vIdx]; // Coordinates from -1.0 to 1.0
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let cameraZoom: f32 = 1.0;
    let textureScale: vec2<f32> = vec2<f32>(1.0, 1.0); 

    // Adjust for screen aspect ratio AND apply Camera Zoom
    let screenUV = vec2<f32>(-in.uv.x * uniforms.aspect, in.uv.y) * cameraZoom;
    
    let rayDir = normalize(vec3<f32>(screenUV.x, screenUV.y, -1.0));
    let rayOrigin = vec3<f32>(0.0, 0.0, 2.5); 
    let sphereCenter = vec3<f32>(0.0, 0.0, 0.0);
    let sphereRadius: f32 = 1.5;
    
    // Ray-Sphere Intersection
    let oc = rayOrigin - sphereCenter;
    let b = dot(oc, rayDir);
    let c = dot(oc, oc) - sphereRadius * sphereRadius;
    let discriminant = b * b - c;
    
    if (discriminant < 0.0) {
        return vec4<f32>(0.1, 0.1, 0.1, 1.0); // Background
    }
    
    let t = -b - sqrt(discriminant);
    let hitPoint = rayOrigin + rayDir * t;
    let normal = normalize(hitPoint - sphereCenter);

    // Map 3D normal to 2D UV (Equirectangular) + Rotate + Apply Texture Scale
    let baseU = (0.5 + (atan2(normal.z, normal.x) / (2.0 * PI)) + uniforms.time * 0.1) * textureScale.x;
    let baseV = (0.5 - (asin(normal.y) / PI)) * textureScale.y;
    
    // Use fract to ensure UVs stay between 0.0 and 1.0 (prevents stripe smearing)
    let u = fract(baseU);
    let v = fract(baseV);

    // SAMPLE WITH textureSampleLevel to bypass uniform control flow errors
    let texColor = textureSampleLevel(tex, samp, vec2<f32>(u, v), 0.0);

    // Lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.15); 
    
    return vec4<f32>(texColor.rgb * diffuse, 1.0);
}`)

        this.#pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: { module: shader, entryPoint: "vs_main" },
            fragment: {
                module: shader,
                entryPoint: "fs_main",
                targets: [{ format: this.renderer.canvas_format }],
            },
            primitive: {
                topology: "triangle-list", // We are drawing a triangle
            },
        })
        this.#sampler = this.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "repeat", // Forces infinite looping horizontally
            addressModeV: "repeat", // Forces infinite looping vertically
        })
        this.#uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.#uniformData = new Float32Array(4)

        this.#bindgroup_uniforms = this.device.createBindGroup({
            layout: this.#pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: this.#uniformBuffer } }],
        })
    }

    create_settings(el) {}

    reset() {
        this.#tex1 = null
    }

    #tex2_res
    #tex1
    #bindgroup
    #bindgroup_uniforms
    #attachment = { view: null, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }
    #pass_desc = { label: "SamplerSphere", colorAttachments: [this.#attachment] }
    run(encoder, video_time, tex1, tex1_res, tex2, tex2_res) {
        if (this.#tex2_res != tex2_res) {
            this.#tex2_res = tex2_res
            this.#uniformData[0] = tex2_res[0] / tex2_res[1]
        }

        if (this.#tex1 != tex1) {
            console.log("Recreating bind group")
            this.#tex1 = tex1
            this.#bindgroup = this.device.createBindGroup({
                layout: this.#pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: tex1 },
                    { binding: 1, resource: this.#sampler },
                ],
            })
        }

        this.#uniformData[1] = video_time
        this.device.queue.writeBuffer(this.#uniformBuffer, 0, this.#uniformData)

        this.#attachment.view = tex2

        const pass = encoder.beginRenderPass(this.#pass_desc)

        pass.setPipeline(this.#pipeline)
        pass.setBindGroup(0, this.#bindgroup)
        pass.setBindGroup(1, this.#bindgroup_uniforms)
        pass.draw(3)
        pass.end()
    }
}
