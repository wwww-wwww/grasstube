import { type ASSImage } from '../util.ts';
import { WebGLRendererBase } from './webgl-base.ts';
interface AtlasTexture {
    texture: WebGLTexture;
    size: number;
    depth: number;
}
export declare class WebGL2Renderer extends WebGLRendererBase<WebGL2RenderingContext> {
    vao: WebGLVertexArrayObject;
    u_atlas: WebGLUniformLocation | null;
    instanceBuffer: WebGLBuffer;
    instanceData: ArrayBuffer;
    instanceFloats: Float32Array;
    instanceBytes: Uint8Array;
    instanceCapacity: number;
    atlas: AtlasTexture | null;
    maxTextureSize: number;
    maxArrayTextureLayers: number;
    uploadCache: Set<string>;
    _createInstanceData(): void;
    ensureInstanceCapacity(count: number): void;
    constructor(canvas: OffscreenCanvas);
    _initGL(): void;
    createAtlasTexture(size: number, depth: number): void;
    render(images: ASSImage[], heap: Uint8Array): void;
    destroy(): void;
}
export {};
