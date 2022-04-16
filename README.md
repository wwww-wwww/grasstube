# grasstube

## Multi channel synchronized player written in Elixir / Phoenix

Includes soft subtitle rendering using [SubtitlesOctopus](https://github.com/Dador/JavascriptSubtitlesOctopus)

### Features

- [x] Custom player
  - [x] Soft subtitles
  - [x] YouTube support
  - [x] Google Drive support (using a userscript)
  - [x] Thumbnails
- [x] Authentication
  - [x] User created rooms
    - [x] Private rooms
    - [x] Public controls
    - [x] Adding users' emote lists
    - [x] Granting operator controls to users
    - [x] Editing rooms
    - [x] Room userscripts
  - [x] User provided list of emotes
- [x] Integrated youtube search

### External Dependencies

- ffmpeg
- youtube-dl (or yt-dlp)

### Thumbnails

Thumbnails are optional.

.thumb struct:
```
40 bytes header:
  4 bytes unsigned int - Number of frames
  4 bytes float - Time of last frame
  32 bytes ascii - MIME type

n bytes body:
  4 + m bytes image:
    4 bytes unsigned int - m (file size)
    m bytes binary image data
```
More info and example on generating the files can be found in the thumb directory.

## To start your Phoenix server:

  * Install dependencies with `mix deps.get`
  * Create and migrate your database with `mix ecto.setup`
  * Start Phoenix endpoint with `mix phx.server`
    * Or enter the interactive shell with `iex -S mix phx.server`

Now you can visit [`localhost:4000`](http://localhost:4000) from your browser

Ready to run in production? Please [check our deployment guides](https://hexdocs.pm/phoenix/deployment.html).
