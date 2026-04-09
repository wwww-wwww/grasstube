export default class Effect {
    desc
    device
    force = false
    enabled = false
    initialized = false
    on_update = null
    constructor(device) {
        this.device = device
        this.desc = { label: this.constructor.name }
    }

    create_settings(el) {
        console.log(`${this.constructor.name}.create_settings not implemented`)
    }

    init() {
        this.initialized = true
    }

    resize(w, h) {
        console.log(`${this.constructor.name}.resize not implemented`)
    }

    run(encoder, t, video_time, texture1, texture2) {
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
