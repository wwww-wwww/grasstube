export class CanvasRendererBase {
    canvas;
    _scheduledResize;
    constructor(canvas) {
        this.canvas = canvas;
    }
    resizeCanvas(width, height) {
        // WebGL doesn't allow 0-sized canvases
        if (!width || !height)
            return;
        if (this.canvas.width === width && this.canvas.height === height)
            return;
        this._scheduledResize = { width, height };
    }
    applyScheduledResize() {
        // Apply a scheduled resize right before rendering, so the resize and the
        // first draw happen in one call and the resized buffer is never presented
        // on its own.
        if (!this._scheduledResize)
            return;
        const resize = this._scheduledResize;
        this._scheduledResize = undefined;
        this.canvas.width = resize.width;
        this.canvas.height = resize.height;
        return resize;
    }
}
//# sourceMappingURL=canvas-base.js.map