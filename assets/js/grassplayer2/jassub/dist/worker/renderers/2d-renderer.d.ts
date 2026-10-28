import { type ASSImage } from '../util.ts';
import { CanvasRendererBase } from './canvas-base.ts';
export declare class Canvas2DRenderer extends CanvasRendererBase {
    ctx: OffscreenCanvasRenderingContext2D;
    bufferCanvas: OffscreenCanvas;
    bufferCtx: OffscreenCanvasRenderingContext2D;
    colorMatrix: Float32Array;
    constructor(canvas: OffscreenCanvas);
    setColorMatrix(subtitleColorSpace?: 'BT601' | 'BT709' | 'SMPTE240M' | 'FCC', videoColorSpace?: 'BT601' | 'BT709'): void;
    render(images: ASSImage[], heap: Uint8Array): void;
    destroy(): void;
}
