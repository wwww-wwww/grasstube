import {get_cookie} from "./cookies"

const fonts = []

function init(socket, room, player) {
    fetch("https://res.cloudinary.com/okea/raw/list/font.json")
    .then(res => res.json())
    .then(data => {
        data.resources.forEach(font => {
            fonts.push(`https://res.cloudinary.com/okea/raw/upload/v${font.version}/${font.public_id}`)
        })
        console.log("fonts: fetched")
        player.set_fonts(fonts)
    })
    .catch(err => {
        console.log("fonts: error fetching", err)
    })
    .finally(() => {
        connect(socket, room, player)
    })
}

function connect(socket, room, player) {
    console.log("video: connecting to room " + room)
    const channel = socket.channel("video:" + room, {})
    channel.join()
        .receive("ok", resp => {
            console.log("video: connected", resp) 
        })
        .receive("error", resp => {
            console.log("video: failed to connect", resp)
        })

    player.on_seek = t => {
        channel.push("seek", {t: Math.round(t)})
    }

    player.on_toggle_playing = playing => {
        channel.push(playing ? "play" : "pause")
    }

    player.on_next = () => {
        channel.push("next")
    }

    player.toggle_controls(false)

    channel.on("setvid", data => {
        console.log("video: setvid", data)
        let videos = {}
        if (data.type == "default") {
            if (data.url.length > 0)
                videos["big"] = data.url
            if (data.small.length > 0)
                videos["small"] = data.small
        } else
            videos = data.url
        player.set_video(data.type, videos, data.sub)
    })

    channel.on("playing", data => {
        console.log("video: playing", data)
        player.set_playing(data.playing)
    })
    
    channel.on("seek", data => {
        console.log("video: seek", data)
        if (Math.abs(data.t - player.current_time()) > 5 && (data.t <= player.duration()))
        player.seek(data.t)
    })

    channel.on("controls", data => {
        console.log("video: controls", data)
        
        player.toggle_controls(true)
    })
}

function httpRequest(opts) {
    document.xmlHttpRequest(opts)
}
/*
            const url = "https://docs.google.com/get_video_info?"
                + "docid=" + file_video
                + "&sle=true"
                + "&hl=en"

            httpRequest({
                method: 'GET',
                url: url,
                onload: resp => {
                    resp = resp.responseText
                    const data = {};

                    resp.split('&').forEach(kv => {
                        const pair = kv.split('=')
                        data[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1])
                    })

                    if (data.status === 'fail') {
                        console.log("Google Drive request failed: " +
                            unescape(data.reason).replace(/\+/g, ""))
                    }

                    if (!data.fmt_stream_map) {
                        alert(
                            "Google has removed the video streams associated" +
                            " with this item.  It can no longer be played."
                        )
                    }

                    data.links = {}
                    data.fmt_stream_map.split(',').forEach(function (item) {
                        const pair = item.split('|')
                        data.links[pair[0]] = pair[1]
                    })

                    const gdrive_link = (get_cookie().lq || false) ? 
                        (data.links[37] ||
                        data.links[22] || 
                        data.links[59] ||
                        data.links[18]) :
                        (data.links[18] ||
                        data.links[59] || 
                        data.links[22] ||
                        data.links[37])
                        

}*/

export default init
