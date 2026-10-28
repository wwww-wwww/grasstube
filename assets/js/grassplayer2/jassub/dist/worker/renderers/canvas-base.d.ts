export declare class CanvasRendererBase {
    canvas: OffscreenCanvas;
    _scheduledResize?: {
        width: number;
        height: number;
    };
    constructor(canvas: OffscreenCanvas);
    resizeCanvas(width: number, height: number): void;
    applyScheduledResize(): {
        width: number;
        height: number;
    } | undefined;
}
