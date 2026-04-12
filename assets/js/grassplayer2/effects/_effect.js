export default class Effect {
    renderer
    device
    desc

    force = false
    enabled = false
    initialized = false
    on_update = null
    constructor(renderer) {
        this.renderer = renderer
        this.device = renderer.device
        this.desc = { label: this.constructor.name }
    }

    get_storage(name) {
        return window.localStorage.getItem(`effect-${this.constructor.name}-${name}`)
    }

    set_storage(name, value) {
        window.localStorage.setItem(`effect-${this.constructor.name}-${name}`, value)
    }

    get_texture(dims, not = []) {
        return this.renderer.get_texture(dims, not)
    }

    create_settings(el) {
        console.log(`${this.constructor.name}.create_settings not implemented`)
    }

    init() {
        this.initialized = true
    }

    load() {
        if (!this.force) {
            this.enabled = this.get_storage("enabled") || this.enabled == "1"
        }
    }

    on_enable() {
        this.set_storage("enabled", "1")
    }

    on_disable() {
        this.set_storage("enabled", "0")
    }

    run(encoder, video_time, tex_in, tex_in_res) {
        console.log(`${this.constructor.name}.run not implemented`)
    }

    create_shader(code) {
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
