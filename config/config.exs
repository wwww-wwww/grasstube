use Mix.Config

config :grasstube, GrasstubeWeb.Endpoint,
  url: [host: "localhost"],
  secret_key_base: "ZKtq7lNDUyfDV6qD4l6QFKE32vzhDVkqISXPILhTOVmV2Wa+Ika03py04c1bix7i",
  render_errors: [view: GrasstubeWeb.ErrorView, accepts: ~w(html json)],
  pubsub: [name: Grasstube.PubSub, adapter: Phoenix.PubSub.PG2],
  controls_password: "password"

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

import_config "#{Mix.env()}.exs"

config :auto_linker,
  opts: [
    phone: false,
    url: true,
    scheme: true,
    class: false,
    rel: false
  ]
