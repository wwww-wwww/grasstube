import 'rvfc-polyfill';
import { Debug } from './debug.ts';
import type { WeightValue } from './worker/util.ts';
import type { ASSRenderer } from './worker/worker';
import type { Remote } from 'abslink';
export declare const webYCbCrMap: {
    readonly rgb: "RGB";
    readonly bt709: "BT709";
    readonly bt470bg: "BT601";
    readonly smpte170m: "BT601";
};
export type JASSUBOptions = {
    timeOffset?: number;
    debug?: boolean;
    prescaleFactor?: number;
    prescaleHeightLimit?: number;
    maxRenderHeight?: number;
    workerUrl?: string;
    wasmUrl?: string;
    modernWasmUrl?: string;
    fonts?: Array<string | Uint8Array>;
    availableFonts?: Record<string, Uint8Array | string>;
    defaultFont?: string;
    queryFonts?: 'local' | 'localandremote' | false;
    libassMemoryLimit?: number;
    libassGlyphLimit?: number;
    proxy?: HTMLElement;
    canvasParent: HTMLElement;
} & ({
    video: HTMLVideoElement;
    canvas?: HTMLCanvasElement;
} | {
    video?: HTMLVideoElement;
    canvas: HTMLCanvasElement;
}) & ({
    subUrl: string;
    subContent?: string;
} | {
    subUrl?: string;
    subContent: string;
});
export default class JASSUB {
    timeOffset: number;
    prescaleFactor: number;
    prescaleHeightLimit: number;
    maxRenderHeight: number;
    debug: Debug | null;
    renderer: Remote<ASSRenderer>;
    ready: Promise<void>;
    busy: boolean;
    _video: HTMLVideoElement | undefined;
    _videoWidth: number;
    _videoHeight: number;
    _videoColorSpace: string | null;
    _canvas: HTMLCanvasElement;
    _ro: ResizeObserver;
    _destroyed: boolean;
    _lastDemandTime: Pick<VideoFrameCallbackMetadata, 'expectedDisplayTime' | 'width' | 'height' | 'mediaTime'>;
    _skipped: boolean;
    _worker: Worker;
    constructor(opts: JASSUBOptions);
    static _supportsSIMD?: boolean;
    static _test(): void;
    resize(forceRepaint?: boolean, renderWidth?: number, renderHeight?: number): Promise<void>;
    _getElementBoundingBox(el: HTMLElement, videoWidth: number, videoHeight: number): {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    _computeRenderSize(width?: number, height?: number): {
        width: number;
        height: number;
    };
    setVideo(target: HTMLVideoElement): Promise<void>;
    _getLocalFont(font: string, weight?: WeightValue): Promise<Uint8Array<ArrayBuffer> | undefined>;
    _handleRVFC(data: VideoFrameCallbackMetadata): void;
    manualRender(data: Pick<VideoFrameCallbackMetadata, 'expectedDisplayTime' | 'width' | 'height' | 'mediaTime'>, repaint?: boolean): Promise<void>;
    _demandRender(repaint?: boolean): Promise<void>;
    _boundUpdateColorSpace: ({ target }: {
        target: EventTarget | null;
    }) => void;
    _updateColorSpace({ target }: {
        target: EventTarget | null;
    }): void;
    _removeListeners(): void;
    destroy(): Promise<void>;
}
