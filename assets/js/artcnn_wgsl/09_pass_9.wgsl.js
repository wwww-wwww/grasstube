export default `
const ksize = vec2<i32>(3, 3);
const offset = vec2<i32>(1, 1);

@group(0) @binding(0) var tex_yuv: texture_2d<f32>;
@group(0) @binding(1) var conv2d_6: texture_2d<f32>;
@group(0) @binding(2) var out_image: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var samp: sampler;

fn ycbcr_to_rgb_rec709(ycbcr: vec3<f32>) -> vec3<f32> {
    let ycbcr_centered = ycbcr - vec3<f32>(0.0, 0.5, 0.5);

    let ycbcr_to_rgb_mat = mat3x3<f32>(
        vec3<f32>(1.0, 1.0, 1.0),
        vec3<f32>(0.0, -0.187324, 1.8556),         
        vec3<f32>(1.5748, -0.468124, 0.0)          
    );

    return ycbcr_to_rgb_mat * ycbcr_centered;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let tex_size = textureDimensions(out_image);

    if (id.x >= tex_size.x || id.y >= tex_size.y) {
        return;
    }

    let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(tex_size);

    let conv2d_6_size = vec2<f32>(textureDimensions(conv2d_6));
    let conv2d_6_pt = 1.0 / vec2<f32>(textureDimensions(conv2d_6));

    let f0 = fract(uv * conv2d_6_size);
    let i0: vec2<i32> = vec2<i32>(f0 * vec2(2.0));
    var y = textureSampleLevel(conv2d_6, samp, (vec2(0.5) - f0) * conv2d_6_pt + uv, 0.0)[i0.y * 2 + i0.x];
    y = clamp(y, 0.0, 1.0);

    let yuv = textureSampleLevel(tex_yuv, samp, uv, 0.0);
    let rgb = ycbcr_to_rgb_rec709(vec3(y, yuv.g, yuv.b));
    textureStore(out_image, id.xy, vec4(rgb, yuv.a));
}`
