# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :grasstube, :scopes,
  user: [
    default: true,
    module: Grasstube.Accounts.Scope,
    assign_key: :current_scope,
    access_path: [:user, :id],
    schema_key: :user_id,
    schema_type: :id,
    schema_table: :user,
    test_data_fixture: Grasstube.AccountsFixtures,
    test_setup_helper: :register_and_log_in_user
  ]

config :grasstube,
  ecto_repos: [Grasstube.Repo],
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :grasstube, GrasstubeWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: GrasstubeWeb.ErrorHTML, json: GrasstubeWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Grasstube.PubSub,
  live_view: [signing_salt: "gx0tkWLt"]

# Configure esbuild (the version is required)
config :esbuild,
  version: "0.25.4",
  grasstube: [
    args:
      ~w(js/app.js js/grassplayer2/effects/lut3d-worker.js --bundle --target=es2022 --outdir=../priv/static/assets --external:/fonts/* --external:/images/* --alias:@=.),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path()]}
  ]

# config :bun,
#   version: "1.3.12",
#   assets: [args: [], cd: Path.expand("../assets", __DIR__)],
#   grasstube: [
#     args:
#       ~w(build js/app.js js/grassplayer2/effects/lut3d-worker.js --outdir=../priv/static/assets/js),
#     cd: Path.expand("../assets", __DIR__)
#   ],
#   tsc: [args: ~w(tsc), cd: Path.expand("../assets", __DIR__)]

config :phoenix_live_view, :colocated_js,
  target_directory: Path.expand("../assets/node_modules/phoenix-colocated", __DIR__)

config :dart_sass,
  version: "1.99.0",
  grasstube: [
    args: ~w(css/app.scss ../priv/static/assets/app.css),
    cd: Path.expand("../assets", __DIR__)
  ]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
