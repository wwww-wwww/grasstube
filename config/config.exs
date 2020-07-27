use Mix.Config

config :grasstube,
  ecto_repos: [Grasstube.Repo]

config :grasstube, GrasstubeWeb.Endpoint,
  url: [host: "localhost"],
  secret_key_base: "",
  render_errors: [view: GrasstubeWeb.ErrorView, accepts: ~w(html json)],
  pubsub: [name: Grasstube.PubSub, adapter: Phoenix.PubSub.PG2],
  live_view: [
    signing_salt: ""
  ]

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, 
  json_library: Jason,
  template_engines: [leex: Phoenix.LiveView.Engine]

import_config "#{Mix.env()}.exs"

config :auto_linker,
  opts: [
    phone: false,
    url: true,
    scheme: true,
    class: false,
    rel: false
  ]
