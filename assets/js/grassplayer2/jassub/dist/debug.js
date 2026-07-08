import throughput from 'throughput';
export class Debug {
    // 5 second average
    fps = throughput(5);
    processingDuration = throughput(5);
    droppedFrames = 0;
    presentedFrames = 0;
    mistimedFrames = 0;
    _drop() {
        ++this.droppedFrames;
    }
    _startTime = 0;
    _startFrame() {
        this._startTime = performance.now();
    }
    onsubtitleFrameCallback = (_, { fps, processingDuration, droppedFrames }) => console.info('%cFPS: %c%f %c| Frame Time: %c%d ms %c| Dropped Frames: %c%d %c| 5s Avg', 'color: #888', 'color: #0f0; font-weight: bold', fps.toFixed(1), 'color: #888', 'color: #0ff; font-weight: bold', processingDuration, 'color: #888', 'color: #f00; font-weight: bold', droppedFrames, 'color: #888');
    _endFrame(meta) {
        ++this.presentedFrames;
        const fps = this.fps(1);
        const now = performance.now();
        const processingDuration = this.processingDuration((now - this._startTime) / fps);
        const frameDelay = Math.max(0, now - meta.expectedDisplayTime);
        if (frameDelay)
            ++this.mistimedFrames;
        this.onsubtitleFrameCallback?.(now, {
            fps,
            processingDuration,
            droppedFrames: this.droppedFrames,
            presentedFrames: this.presentedFrames,
            mistimedFrames: this.mistimedFrames,
            presentationTime: now,
            expectedDisplayTime: meta.expectedDisplayTime + (frameDelay > 0 ? fps / 1000 : 0),
            frameDelay,
            width: meta.width,
            height: meta.height,
            mediaTime: meta.mediaTime
        });
    }
}
//# sourceMappingURL=debug.js.map