import { get_meta } from "./util"

function url(url) {
    if (get_meta("referer") == "discord.com") {
        url = url.replace("https://", "").split("/")
        url[0] = url[0].replaceAll(".", "-")
        return "/proxy/" + url.join("/")
    }
    return url
}

export default url
