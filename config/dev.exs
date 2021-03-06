use Mix.Config

config :grasstube, Grasstube.Repo,
  username: "grasstube",
  password: "grasstube",
  database: "grasstube",
  hostname: "192.168.1.51",
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

config :grasstube, Grasstube.Guardian,
  issuer: "Grasstube",
  secret_key: ""

config :grasstube,
  youtube_api_keys: [
  ]

config :grasstube, GrasstubeWeb.Endpoint,
  http: [port: 17001],
  url: [host: "tube.grass.moe"],
  debug_errors: true,
  code_reloader: true,
  check_origin: false,
  static_url: [path: "/"],
  watchers: [
    node: [
      "node_modules/webpack/bin/webpack.js",
      "--mode",
      "development",
      "--watch-stdin",
      cd: Path.expand("../assets", __DIR__)
    ]
  ]

config :grasstube, GrasstubeWeb.Endpoint,
  live_reload: [
    patterns: [
      ~r{priv/static/.*(js|css|png|jpeg|jpg|gif|svg)$},
      ~r{priv/gettext/.*(po)$},
      ~r{lib/grasstube_web/views/.*(ex)$},
      ~r{lib/grasstube_web/templates/.*(eex)$},
      ~r{lib/grasstube_web/live/.*(ex)$}
    ]
  ]

config :logger, :console, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20

config :phoenix, :plug_init_mode, :runtime
