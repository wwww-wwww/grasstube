export interface SubtitleCallbackMetadata {
    fps: number;
    processingDuration: number;
    droppedFrames: number;
    presentedFrames: number;
    mistimedFrames: number;
    presentationTime: DOMHighResTimeStamp;
    expectedDisplayTime: DOMHighResTimeStamp;
    width: number;
    height: number;
    mediaTime: number;
    frameDelay: DOMHighResTimeStamp;
}
export declare class Debug {
    fps: (delta: any) => number;
    processingDuration: (delta: any) => number;
    droppedFrames: number;
    presentedFrames: number;
    mistimedFrames: number;
    _drop(): void;
    _startTime: number;
    _startFrame(): void;
    onsubtitleFrameCallback?: (now: DOMHighResTimeStamp, metadata: SubtitleCallbackMetadata) => void;
    _endFrame(meta: Pick<VideoFrameCallbackMetadata, 'expectedDisplayTime' | 'width' | 'height' | 'mediaTime'>): void;
}
