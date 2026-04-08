export default class {
    #enabled = false
    #desc
    #device
    constructor(device) {
        this.device = device
        this.desc = {
            label: this.constructor.name
        }
    }
    create_settings(el) {
        console.log(`${this.constructor.name}.create_settings not implemented`)
    }
    init() {
        console.log(`${this.constructor.name}.init not implemented`)
    }
    resize(w, h) {
        this.x = Math.ceil(w / 16)
        this.y = Math.ceil(h / 16)
    }
    run(encoder, t, video_time, texture1, texture2) {
        console.log(`${this.constructor.name}.run not implemented`)
    }
    create_shader(code) {
        const module = this.device.createShaderModule({ code })
        const log = async () => {
            const info = await module.getCompilationInfo();

            for (const message of info.messages) {
                console.error(`Line ${message.lineNum}:${message.linePos} - ${message.message}`);
            }
        }
        log()

        return module
    }
}
