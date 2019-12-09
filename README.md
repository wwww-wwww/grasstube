# grasstube

## Multi channel synchronized player written in Elixir / Phoenix

Includes soft subtitle rendering using [SubtitlesOctopus](https://github.com/Dador/JavascriptSubtitlesOctopus)

### features

- [x] custom player
  - [x] soft subtitles
  - [x] youtube support
  - [x] google drive support (userscript)
- [x] authentication
  - [x] user created rooms
    - [x] private rooms
    - [ ] editing rooms
  - [x] user provided list of emotes
- [x] integrated youtube search

### deps

```
ffmpeg (ffprobe)
youtube-dl
```

### getting started

```
git clone https://github.com/wwww-wwww/grasstube.git
cd grasstube && mix deps.get
cd assets && npm install && cd ..
iex -S mix phx.server
```
