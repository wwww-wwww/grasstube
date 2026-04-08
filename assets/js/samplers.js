import Effect from "./effect"

class EffectSampler extends Effect {
    constructor(device, video, canvas) {
        super(device)

        this.video = video
        this.canvas = canvas
    }
    init() {
        this.texture1 = null
    }
    resize(w, h) {
        this.x = Math.ceil(this.canvas.width / 16)
        this.y = Math.ceil(this.canvas.height / 16)
        this.texture1 = null
    }
    run(encoder, t, video_time, texture1, texture2) {
        if (this.texture1 != texture1) {
            this.texture1 = texture1
            this.bindgroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: texture1 },
                    { binding: 1, resource: this.sampler },
                ]
            })
        }

        const pass = encoder.beginComputePass(this.desc)
        pass.setPipeline(this.pipeline)
        pass.setBindGroup(0, this.bindgroup)
        pass.setBindGroup(1, this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: texture2 }]
        }))
        pass.dispatchWorkgroups(this.x, this.y)
        pass.end()
    }
}

class SamplerHermite extends EffectSampler {
    init() {
        super.init()

        this.pipeline = this.device.createComputePipeline({
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
    let color = textureSampleLevel(tex, samp, pos, 0.0);

    textureStore(outputTexture, id.xy, color);
}`)
            },
        })
        this.sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        })
    }
}

class SamplerDefault extends EffectSampler {
    init() {
        super.init()

        this.pipeline = this.device.createComputePipeline({
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

    let color = textureSampleLevel(tex, samp, uv, 0.0);

    textureStore(outputTexture, id.xy, color);
}`)
            },
        })
        this.sampler = this.device.createSampler({
            minFilter: "linear",
            magFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        })
    }
}

class SamplerSphere extends EffectSampler {
    init() {
        super.init()

        const shader = this.create_shader(/* wgsl */`
struct Uniforms {
    aspect: f32,
    time: f32,
    padding1: f32, // Padding to meet 16-byte alignment rules
    padding2: f32,
};

@group(0) @binding(0) var myTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var mySampler: sampler;

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
    let texColor = textureSampleLevel(myTexture, mySampler, vec2<f32>(u, v), 0.0);

    // Lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.15); 
    
    return vec4<f32>(texColor.rgb * diffuse, 1.0);
}`)

        this.sampler = this.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "repeat", // Forces infinite looping horizontally
            addressModeV: "repeat", // Forces infinite looping vertically
        });
        this.pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shader,
                entryPoint: "vs_main",
            },
            fragment: {
                module: shader,
                entryPoint: "fs_main",
                targets: [{ format: "rgba8unorm" }], // Output format matches our canvas
            },
            primitive: {
                topology: "triangle-list", // We are drawing a triangle
            },
        })
        this.uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        this.uniformData = new Float32Array(4)
    }
    run(encoder, t, video_time, texture1, texture2) {
        this.uniformData[1] = t / 2000
        this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: texture2,
                clearValue: [0, 0, 0, 1],
                loadOp: "clear",
                storeOp: "store",
            }]
        });

        pass.setPipeline(this.pipeline);

        // We bind the "Pong" texture here as a standard texture_2d
        pass.setBindGroup(0, this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: texture1 },
                { binding: 2, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.sampler },
            ]
        }))

        pass.draw(3, 1, 0, 0)
        pass.end()
    }
}


export { EffectSampler, SamplerDefault, SamplerHermite, SamplerSphere }

