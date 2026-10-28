import { finalizer } from 'abslink';
import { Canvas2DRenderer } from './renderers/2d-renderer.ts';
import { WebGL1Renderer } from './renderers/webgl1-renderer.ts';
import { WebGL2Renderer } from './renderers/webgl2-renderer.ts';
import { type ASSEvent, type ASSImage, type ASSStyle, type WeightValue } from './util.ts';
import type { JASSUB } from '../wasm/types.d.ts';
interface opts {
    wasmUrl: string;
    width: number;
    height: number;
    subUrl: string | undefined;
    subContent: string | null;
    fonts: Array<string | Uint8Array>;
    availableFonts: Record<string, Uint8Array | string | string[]>;
    defaultFont: string;
    debug: boolean;
    libassMemoryLimit: number;
    libassGlyphLimit: number;
    queryFonts: 'local' | 'localandremote' | false;
}
export interface ImageFrame {
    count: number;
    atlas: Uint8Array | null;
    instances: Float32Array | null;
    width: number;
    height: number;
}
export interface RenderedImages {
    frames: Array<ImageFrame | undefined>;
    subtitleColorSpace: 'BT601' | 'BT709' | 'SMPTE240M' | 'FCC' | null;
    videoColorSpace: 'BT709' | 'BT601' | null;
}
declare const constructor: unique symbol;
export declare class ASSRenderer {
    _wasm: JASSUB;
    _subtitleColorSpace?: 'BT601' | 'BT709' | 'SMPTE240M' | 'FCC' | null;
    _videoColorSpace?: 'BT709' | 'BT601';
    _malloc: (size: number) => number;
    _gpurender: WebGL2Renderer | WebGL1Renderer | Canvas2DRenderer;
    debug: boolean;
    constructor(...args: [data: opts, getFont: (font: string, weight: WeightValue) => Promise<Uint8Array<ArrayBuffer> | undefined>, ctrl: OffscreenCanvas, onFontsChanged?: () => void]);
    [constructor](data: opts, getFont: (font: string, weight: WeightValue) => Promise<Uint8Array<ArrayBuffer> | undefined>, ctrl: OffscreenCanvas, onFontsChanged?: () => void): Promise<this>;
    processData(events: string): void;
    processChunk(data: string, timecode: number, duration: number): void;
    createEvent(event: ASSEvent): void;
    getEvents(): Array<Partial<ASSEvent>>;
    setEvent(event: ASSEvent, index: number): void;
    removeEvent(index: number): void;
    createStyle(style: ASSStyle): void;
    getStyles(): ASSStyle[];
    setStyle(style: ASSStyle, index: number): void;
    removeStyle(index: number): void;
    styleOverride(style: ASSStyle): void;
    disableStyleOverride(): void;
    setTrack(content: string): void;
    freeTrack(): void;
    setTrackByUrl(url: string): Promise<void>;
    _checkColorSpace(): void;
    _defaultFont: string;
    setDefaultFont(fontName: string): void;
    _log(log: string): Promise<void>;
    addFonts(fontOrURLs: Array<Uint8Array | string>): Promise<boolean>;
    _loadedInitialFonts: boolean;
    _loadInitialFonts(fontOrURLs: Array<Uint8Array | string>): Promise<void>;
    _getFont: (font: string, weight: WeightValue) => Promise<Uint8Array<ArrayBuffer> | undefined>;
    _availableFonts: Record<string, Uint8Array | string | string[]>;
    _checkedFonts: Set<string>;
    _findAvailableFont(fontName: string, weight?: WeightValue): Promise<boolean | undefined>;
    queryFonts: 'local' | 'localandremote' | false;
    _queryLocalFont(fontName: string, weight: WeightValue): Promise<Uint8Array<ArrayBuffer> | undefined>;
    _queryRemoteFont(postscriptNames: string[]): Promise<Uint8Array<any> | undefined>;
    _asyncWrite(font: string): Promise<void>;
    _fontId: number;
    _onFontsChanged?: () => void;
    _allocFonts(uint8s: Uint8Array[]): void;
    _resizeCanvas(width: number, height: number, videoWidth: number, videoHeight: number): void;
    [finalizer](): Promise<void>;
    _draw(time: number, repaint?: boolean): void;
    _imagesSize?: [number, number, number, number];
    _renderImages(times: number[], width: number, height: number, videoWidth: number, videoHeight: number, repaint?: boolean): RenderedImages;
    _packImages(images: ASSImage[]): ImageFrame;
    _drawCapture(time: number): {
        data: ImageDataArray;
        width: number;
        height: number;
    } | undefined;
    _setColorSpace(videoColorSpace: 'RGB' | 'BT709' | 'BT601'): void;
}
export {};
