export default `
// PASS: conv2d
// //!DESC ArtCNN C4F16 (Conv2D)
// //!COMPUTE 24 32 12 16
// //!HOOK LUMA
// //!BIND LUMA
// //!SAVE conv2d
// //!WIDTH LUMA.w 2.0 *
// //!HEIGHT LUMA.h 2.0 *
// //!COMPONENTS 4
// //!WHEN OUTPUT.w LUMA.w / 1.3 > OUTPUT.h LUMA.h / 1.3 > *

const ksize = vec2<i32>(3, 3);
const offset = vec2<i32>(1, 1);

const LUMA_mul: f32 = 1.0;

@group(0) @binding(0) var LUMA_raw: texture_2d<f32>;
@group(0) @binding(1) var out_image: texture_storage_2d<rgba16float, write>;

var<workgroup> inp: array<array<array<f32, 18>, 18>, 1>;
@compute @workgroup_size(16, 16)
fn main(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) workgroup_id: vec3<u32>,
    @builtin(global_invocation_id) global_id: vec3<u32>
) {
    let local_xy: vec2<u32> = local_id.xy;
    var base: vec2<i32> = vec2<i32>(workgroup_id.xy) * vec2<i32>(16, 16);
    for (var y: u32 = local_xy.y; y < 18u; y += 16u) {
        for (var x: u32 = local_xy.x; x < 18u; x += 16u) {
            let input_base: vec2<i32> = (base + vec2<i32>(i32(x), i32(y)) - offset) * vec2<i32>(1, 1);
            inp[0][y][x] = f32(LUMA_mul * textureLoad(LUMA_raw, input_base + vec2<i32>(0, 0), 0).x);
        }
    }

    workgroupBarrier();
    var result0: vec4<f32> = vec4<f32>(-0.0027198044, -0.013629392, -0.015712878, -0.050803013);
    var result1: vec4<f32> = vec4<f32>(-0.02707489, -0.0062177293, 0.0026368732, -0.0029379292);
    var result2: vec4<f32> = vec4<f32>(0.03127001, -0.0039273943, -0.0040966137, -0.0016518718);
    var result3: vec4<f32> = vec4<f32>(0.0028380281, 0.00058883557, 0.013085538, -0.058857743);
    let inp_0_0_0: f32 = inp[0][local_xy.y + 0][local_xy.x + 0];
    let inp_0_1_0: f32 = inp[0][local_xy.y + 0][local_xy.x + 1];
    let inp_0_2_0: f32 = inp[0][local_xy.y + 0][local_xy.x + 2];
    let inp_0_0_1: f32 = inp[0][local_xy.y + 1][local_xy.x + 0];
    let inp_0_1_1: f32 = inp[0][local_xy.y + 1][local_xy.x + 1];
    let inp_0_2_1: f32 = inp[0][local_xy.y + 1][local_xy.x + 2];
    let inp_0_0_2: f32 = inp[0][local_xy.y + 2][local_xy.x + 0];
    let inp_0_1_2: f32 = inp[0][local_xy.y + 2][local_xy.x + 1];
    let inp_0_2_2: f32 = inp[0][local_xy.y + 2][local_xy.x + 2];
    result0 += vec4<f32>(-0.016452063, -0.1258466, 0.013886958, 0.036870774) * inp_0_0_0;
    result0 += vec4<f32>(0.04311634, 0.15515013, 0.12190506, 0.12543218) * inp_0_1_0;
    result0 += vec4<f32>(-0.0049624983, 0.1029244, -0.10124424, 0.06448426) * inp_0_2_0;
    result0 += vec4<f32>(0.001886782, 0.06120591, 0.020384936, 0.16804346) * inp_0_0_1;
    result0 += vec4<f32>(-0.04256893, -0.07616671, -0.37889892, 0.27856478) * inp_0_1_1;
    result0 += vec4<f32>(-0.20398517, -0.12900643, 0.113083735, 0.11175711) * inp_0_2_1;
    result0 += vec4<f32>(0.009553091, 0.13118562, -0.031063978, 0.09478131) * inp_0_0_2;
    result0 += vec4<f32>(0.066157505, -0.114692695, 0.22418123, -0.009412468) * inp_0_1_2;
    result0 += vec4<f32>(0.15508306, 0.011386595, 0.014014352, 0.09318008) * inp_0_2_2;
    result1 += vec4<f32>(0.08046117, -0.07086712, -0.102300294, 0.014950261) * inp_0_0_0;
    result1 += vec4<f32>(-0.06476857, -0.014190924, -0.017589286, -0.19119741) * inp_0_1_0;
    result1 += vec4<f32>(0.05054515, 0.115604624, 0.06517106, 0.13799176) * inp_0_2_0;
    result1 += vec4<f32>(-0.045681432, 0.08269155, 0.10319298, -0.026858954) * inp_0_0_1;
    result1 += vec4<f32>(0.11229104, -0.17059296, 0.13794285, 0.18026339) * inp_0_1_1;
    result1 += vec4<f32>(-0.1267971, 0.23877597, -0.18725446, -0.12132741) * inp_0_2_1;
    result1 += vec4<f32>(0.05785694, -0.015154775, 0.026422592, 0.002328838) * inp_0_0_2;
    result1 += vec4<f32>(0.07150728, -0.22784448, -0.12155527, 0.027110105) * inp_0_1_2;
    result1 += vec4<f32>(-0.08247087, 0.06362491, 0.08973536, -0.02196324) * inp_0_2_2;
    result2 += vec4<f32>(-0.06092033, 0.1256232, -0.11233013, -0.061837807) * inp_0_0_0;
    result2 += vec4<f32>(0.08898802, -0.028417582, 0.15791786, -0.01610648) * inp_0_1_0;
    result2 += vec4<f32>(0.06330266, -0.009340407, 0.017859828, -0.007937439) * inp_0_2_0;
    result2 += vec4<f32>(-0.17722517, 0.31189576, 0.32109433, 0.18112311) * inp_0_0_1;
    result2 += vec4<f32>(-0.2903746, -0.72364086, -0.3329427, -0.08360631) * inp_0_1_1;
    result2 += vec4<f32>(0.14228302, 0.11720193, -0.056604996, -0.027815754) * inp_0_2_1;
    result2 += vec4<f32>(0.035853237, 0.118430145, -0.12544365, -0.02719196) * inp_0_0_2;
    result2 += vec4<f32>(0.20537417, 0.07353585, 0.10881828, 0.1451791) * inp_0_1_2;
    result2 += vec4<f32>(-0.1517126, -0.010349405, 0.018765846, -0.09707698) * inp_0_2_2;
    result3 += vec4<f32>(0.052764144, -0.10130216, 0.22795214, -0.09385554) * inp_0_0_0;
    result3 += vec4<f32>(-0.16102873, 0.18050277, 0.36273104, 0.1743911) * inp_0_1_0;
    result3 += vec4<f32>(0.008320275, -0.031096114, 0.06665433, 0.047147725) * inp_0_2_0;
    result3 += vec4<f32>(0.039706435, -0.0059984834, 0.026533028, -0.19475575) * inp_0_0_1;
    result3 += vec4<f32>(0.017116806, -0.1657458, -0.4245533, 0.011194904) * inp_0_1_1;
    result3 += vec4<f32>(0.03566397, 0.1254953, -0.16895337, 0.20406392) * inp_0_2_1;
    result3 += vec4<f32>(-0.0622524, 0.11329407, -0.052762877, -0.081980705) * inp_0_0_2;
    result3 += vec4<f32>(0.08946176, -0.05226282, -0.15308078, -0.0015630769) * inp_0_1_2;
    result3 += vec4<f32>(-0.018317576, -0.06487258, -0.012865839, 0.13352033) * inp_0_2_2;
    let output_base: vec2<i32> = vec2<i32>(global_id.xy) * vec2<i32>(2, 2);
    textureStore(out_image, output_base + vec2<i32>(0, 0), result0);
    textureStore(out_image, output_base + vec2<i32>(1, 0), result1);
    textureStore(out_image, output_base + vec2<i32>(0, 1), result2);
    textureStore(out_image, output_base + vec2<i32>(1, 1), result3);
}`
