import { type ASSImage } from '../util.ts';
import { CanvasRendererBase } from './canvas-base.ts';
export interface AtlasItem {
    img: ASSImage;
    packW?: number;
    sourceKey: string | 0;
    x: number;
    y: number;
    layer: number;
}
export declare abstract class WebGLRendererBase<T extends WebGLRenderingContext | WebGL2RenderingContext> extends CanvasRendererBase {
    gl: T;
    program: WebGLProgram;
    u_resolution: WebGLUniformLocation | null;
    u_colorMatrix: WebGLUniformLocation | null;
    colorMatrix: Float32Array;
    constructor(canvas: OffscreenCanvas);
    abstract _initGL(): void;
    abstract render(images: ASSImage[], heap: Uint8Array): void;
    abstract destroy(): void;
    packAtlas(items: AtlasItem[], size: number, padding?: number, dedupeAcrossPages?: boolean): number;
    createProgram(vertexSource: string, fragmentSource: string): void;
    createShader(type: number, source: string): WebGLShader;
    setColorMatrix(subtitleColorSpace?: 'BT601' | 'BT709' | 'SMPTE240M' | 'FCC', videoColorSpace?: 'BT601' | 'BT709'): void;
    beginFrame(images: ASSImage[]): boolean;
    applyCommonState(textureUniform: WebGLUniformLocation | null): void;
}
