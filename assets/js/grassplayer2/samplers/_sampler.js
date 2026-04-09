import Effect from "../effects/_effect"

export default class EffectSampler extends Effect {
    video
    canvas
    constructor(device, video, canvas) {
        super(device)
        this.video = video
        this.canvas = canvas
    }

    reset() { }
}
