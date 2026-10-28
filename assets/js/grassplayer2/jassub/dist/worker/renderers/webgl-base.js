import { IDENTITY_MATRIX, resolveColorMatrix } from "../util.js";
import { CanvasRendererBase } from "./canvas-base.js";
export class WebGLRendererBase extends CanvasRendererBase {
    gl;
    program;
    // Uniform locations
    u_resolution = null;
    u_colorMatrix = null;
    colorMatrix = IDENTITY_MATRIX;
    constructor(canvas) {
        super(canvas);
        canvas.addEventListener('webglcontextlost', e => {
            e.preventDefault();
            this.gl = null;
        });
        canvas.addEventListener('webglcontextrestored', () => this._initGL());
    }
    // Dedupe identical sources
    packAtlas(items, size, padding = 0, dedupeAcrossPages = false) {
        let placed = new Map();
        let page = 0;
        let x = 0;
        let y = 0;
        let shelfHeight = 0;
        for (const item of items) {
            const { img, sourceKey } = item;
            const packW = item.packW ?? img.w;
            const cached = sourceKey && placed.get(sourceKey);
            if (cached) {
                item.x = cached.x;
                item.y = cached.y;
                item.layer = cached.layer;
                continue;
            }
            if (x + packW > size) {
                x = 0;
                y += shelfHeight + padding;
                shelfHeight = 0;
            }
            if (y + img.h > size) {
                page++;
                x = 0;
                y = 0;
                shelfHeight = 0;
                if (!dedupeAcrossPages)
                    placed = new Map();
            }
            item.x = x;
            item.y = y;
            item.layer = page;
            shelfHeight = Math.max(shelfHeight, img.h);
            if (sourceKey)
                placed.set(sourceKey, item);
            x += packW + padding;
        }
        return page + 1;
    }
    createProgram(vertexSource, fragmentSource) {
        // Create shaders
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
        // Create program
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const info = this.gl.getProgramInfoLog(program);
            this.gl.deleteProgram(program);
            throw new Error('Failed to link program: ' + info);
        }
        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);
        this.program = program;
    }
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        if (!shader)
            throw new Error('Failed to create shader');
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error('Failed to compile shader: ' + info);
        }
        return shader;
    }
    // Set the color matrix for color space conversion.
    // Pass null or undefined to use identity (no conversion).
    setColorMatrix(subtitleColorSpace, videoColorSpace) {
        this.colorMatrix = resolveColorMatrix(subtitleColorSpace, videoColorSpace);
        if (!this.gl || !this.u_colorMatrix)
            return;
        this.gl.useProgram(this.program);
        this.gl.uniformMatrix3fv(this.u_colorMatrix, false, this.colorMatrix);
    }
    beginFrame(images) {
        const resize = this.applyScheduledResize();
        // Update viewport and resolution uniform
        if (resize) {
            this.gl.viewport(0, 0, resize.width, resize.height);
            this.gl.uniform2f(this.u_resolution, resize.width, resize.height);
        }
        // Clear canvas
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        if (images.length === 0) {
            this.gl.flush();
            return false;
        }
        return true;
    }
    applyCommonState(textureUniform) {
        // Set up blending for premultiplied alpha
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
        // Use the program
        this.gl.useProgram(this.program);
        // Set texture unit
        this.gl.uniform1i(textureUniform, 0);
        // Set initial color matrix
        this.gl.uniformMatrix3fv(this.u_colorMatrix, false, this.colorMatrix);
        // Set one-time GL state
        this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1);
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.uniform2f(this.u_resolution, this.canvas.width, this.canvas.height);
    }
}
//# sourceMappingURL=webgl-base.js.map