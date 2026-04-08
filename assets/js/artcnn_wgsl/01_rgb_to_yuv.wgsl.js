export default `
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

fn rgb_to_ycbcr_rec709(rgb: vec3<f32>) -> vec3<f32> {
    let rgb_to_ycbcr_mat = mat3x3<f32>(
        vec3<f32>(0.2126, -0.114572,  0.5),
        vec3<f32>(0.7152, -0.385428, -0.454153), 
        vec3<f32>(0.0722,  0.5,      -0.045847)
    );

    let ycbcr = rgb_to_ycbcr_mat * rgb;

    return ycbcr + vec3<f32>(0.0, 0.5, 0.5);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let tex_size = textureDimensions(outputTexture);

    if (id.x >= tex_size.x || id.y >= tex_size.y) {
        return;
    }

    let rgb = textureLoad(tex, id.xy, 0);

    let yuv = rgb_to_ycbcr_rec709(rgb.rgb);

    textureStore(outputTexture, id.xy, vec4(yuv.rgb, rgb.a));
}`
