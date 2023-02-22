import Config

config :grasstube,
  ecto_repos: [Grasstube.Repo],
  ytdl: "yt-dlp",
  max_rooms: :unlimited,
  serve_emotes: true

config :grasstube, GrasstubeWeb.Endpoint,
  url: [host: "localhost"],
  render_errors: [view: GrasstubeWeb.ErrorView, accepts: ~w(html json), layout: false],
  pubsub_server: Grasstube.PubSub,
  live_view: [signing_salt: "PPjU/8aX"]

config :esbuild,
  version: "0.14.29",
  app: [
    args: ~w(js/app.js --bundle --target=es2017 --outdir=../priv/static/assets),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => Path.expand("../deps", __DIR__)}
  ]

config :dart_sass,
  version: "1.39.0",
  app: [
    args: ~w(css/app.scss ../priv/static/assets/app.css),
    cd: Path.expand("../assets", __DIR__)
  ]

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
