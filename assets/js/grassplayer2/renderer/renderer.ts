export default interface Renderer {
    on_buffers?: ((buffers: any) => void)
    on_buffer_end?: ((end: number) => void)
    on_timeupdate?: ((t: number) => void)
    set_captions: (b: boolean) => void
    set_volume: (v: number) => void
    duration: () => number
    set_speed: (s: number) => void
    set_video: (video: string | null, subtitles: string | null) => void
    set_playing: (b: boolean) => void
    playing: () => boolean
    current_time: () => number
    seek: (t: number, final: boolean) => void
    set_catchup: (target: number, time: number) => void
    set_muted: (b: boolean) => void
}