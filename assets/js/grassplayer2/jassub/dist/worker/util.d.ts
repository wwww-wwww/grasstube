export interface ASSEvent {
    Start: number;
    Duration: number;
    Name: string;
    Effect: string;
    Text: string;
    ReadOrder: number;
    Layer: number;
    Style: number;
    MarginL: number;
    MarginR: number;
    MarginV: number;
}
export interface ASSStyle {
    Name: string;
    FontName: string;
    FontSize: number;
    PrimaryColour: number;
    SecondaryColour: number;
    OutlineColour: number;
    BackColour: number;
    Bold: number;
    Italic: number;
    Underline: number;
    StrikeOut: number;
    ScaleX: number;
    ScaleY: number;
    Spacing: number;
    Angle: number;
    BorderStyle: number;
    Outline: number;
    Shadow: number;
    Alignment: number;
    MarginL: number;
    MarginR: number;
    MarginV: number;
    Encoding: number;
    treat_fontname_as_pattern: number;
    Blur: number;
    Justify: number;
}
export interface ASSImage {
    w: number;
    h: number;
    dst_x: number;
    dst_y: number;
    stride: number;
    color: number;
    bitmap: number;
}
export declare const WEIGHT_MAP: readonly ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black", "ultrablack"];
export type WeightValue = typeof WEIGHT_MAP[number];
export declare const IS_FIREFOX: boolean;
export declare const IS_SAFARI: boolean;
export declare const LIBASS_YCBCR_MAP: readonly [null, "BT601", null, "BT601", "BT601", "BT709", "BT709", "SMPTE240M", "SMPTE240M", "FCC", "FCC"];
export declare const _fetch: typeof fetch;
export declare function fetchtext(url: string): Promise<string>;
export declare const THREAD_COUNT: number;
export declare const SUPPORTS_GROWTH: boolean;
export declare const SHOULD_REFERENCE_MEMORY: boolean;
export declare const IDENTITY_MATRIX: Float32Array<ArrayBuffer>;
export declare const colorMatrixConversionMap: {
    readonly BT601: {
        readonly BT709: Float32Array<ArrayBuffer>;
        readonly BT601: Float32Array<ArrayBuffer>;
    };
    readonly BT709: {
        readonly BT601: Float32Array<ArrayBuffer>;
        readonly BT709: Float32Array<ArrayBuffer>;
    };
    readonly FCC: {
        readonly BT709: Float32Array<ArrayBuffer>;
        readonly BT601: Float32Array<ArrayBuffer>;
    };
    readonly SMPTE240M: {
        readonly BT709: Float32Array<ArrayBuffer>;
        readonly BT601: Float32Array<ArrayBuffer>;
    };
};
export type ColorSpace = keyof typeof colorMatrixConversionMap;
