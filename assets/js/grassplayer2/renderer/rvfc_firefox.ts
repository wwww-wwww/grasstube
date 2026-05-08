export default function (video: HTMLVideoElement | any, callback: () => void) {
    let last_decoded = video.mozDecodedFrames
    let last_presented = video.mozPresentedFrames
    const check = () => {
        if (video.mozDecodedFrames != last_decoded || video.mozPresentedFrames != last_presented) {
            last_decoded = video.mozDecodedFrames
            last_presented = video.mozPresentedFrames
            callback()
        }
        requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
}
