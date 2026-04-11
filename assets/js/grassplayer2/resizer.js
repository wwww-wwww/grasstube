class Resizer {
    constructor(device, root, video, canvas) {
        this.device = device
        this.root = root
        this.video = video
        this.canvas = canvas
    }

    create_settings(el) {
        console.log(`${this.constructor.name}.create_settings not implemented`)
    }

    resize() {
        console.log(`${this.constructor.name}.resize not implemented`)
    }
}

class ResizerBestFit extends Resizer {
    create_settings(el) {
        el.innerHTML = `
<div><span>View</span><span class="dims-root"></span></div>
<div><span>Canvas</span><span class="dims-canvas"></span></div>
`
        this.txt_root = el.querySelector(".dims-root")
        this.txt_dims = el.querySelector(".dims-canvas")
    }

    resize() {
        if (!this.video.videoWidth || !this.video.videoHeight) return

        const view_width = this.root.getBoundingClientRect().width
        const view_height = this.root.getBoundingClientRect().height
        const video_width = this.video.videoWidth
        const video_height = this.video.videoHeight

        let width = Math.max(1, Math.min(view_width, this.device.limits.maxTextureDimension2D))
        let height = Math.max(1, Math.min(view_height, this.device.limits.maxTextureDimension2D))

        let scaled_video_width = 0
        let scaled_video_height = 0

        if (width / height > video_width / video_height) {
            scaled_video_height = Math.round(height)
            scaled_video_width = Math.round(video_width / video_height * scaled_video_height)
        } else {
            scaled_video_width = Math.round(width)
            scaled_video_height = Math.round(video_height / video_width * scaled_video_width)
        }

        this.canvas.width = scaled_video_width
        this.canvas.height = scaled_video_height
        this.txt_root.textContent = `${Math.round(view_width)}x${Math.round(view_height)}`
        this.txt_dims.textContent = `${scaled_video_width}x${scaled_video_height}`
    }
}

class ResizerStretch extends Resizer {
    resize() {
        if (!this.video.videoWidth || !this.video.videoHeight) return

        const view_width = this.root.getBoundingClientRect().width
        const view_height = this.root.getBoundingClientRect().height

        let width = Math.max(1, Math.min(view_width, this.device.limits.maxTextureDimension2D))
        let height = Math.max(1, Math.min(view_height, this.device.limits.maxTextureDimension2D))

        this.canvas.width = width
        this.canvas.height = height
        this.uniformData[0] = this.canvas.width / this.canvas.height;
    }
}

export { ResizerBestFit, ResizerStretch }
