import RendererWebGPU from "../renderer/rendererwebgpu"

export default class Effect {
    renderer
    device
    desc

    force = false
    enabled = false
    initialized = false
    on_update: any = null
    constructor(renderer: RendererWebGPU) {
        this.renderer = renderer
        this.device = renderer.device!
        this.desc = { label: this.constructor.name }
    }

    get_storage(name: string) {
        return window.localStorage.getItem(`effect-${this.constructor.name}-${name}`)
    }

    set_storage(name: string, value: string | number) {
        window.localStorage.setItem(`effect-${this.constructor.name}-${name}`, value.toString())
    }

    get_texture(dims: [number, number], not = []) {
        return this.renderer.get_texture(dims, not)
    }

    create_settings(el: HTMLElement) {
        console.log(`${this.constructor.name}.create_settings not implemented`)
    }

    init() {
        this.initialized = true
    }

    load() {
        if (!this.force) {
            this.enabled = (this.get_storage("enabled") || (this.enabled && "1")) == "1"
        }
    }

    on_enable() {
        this.set_storage("enabled", "1")
    }

    on_disable() {
        this.set_storage("enabled", "0")
    }

    run(encoder: GPUCommandEncoder, video_time: number, tex_in: GPUTextureView, tex_in_res: [number, number]) {
        console.log(`${this.constructor.name}.run not implemented`)
    }

    create_shader(code: string) {
        const module = this.device.createShaderModule({ code })
        const log = async () => {
            const info = await module.getCompilationInfo();

            for (const message of info.messages) {
                console.error(`Line ${message.lineNum}:${message.linePos} - ${message.message}`)
            }
        }
        log()

        return module
    }
}
