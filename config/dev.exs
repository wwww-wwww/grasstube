import Config

config :grasstube, Grasstube.Repo,
  username: "grasstube",
  password: "grasstube",
  database: "grasstube",
  hostname: "192.168.1.51",
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

config :grasstube,
  youtube_api_keys: [
  ]

config :grasstube, GrasstubeWeb.Endpoint,
  http: [ip: {0, 0, 0, 0}, port: 17001],
  url: [host: "tube.grass.moe"],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: "tZqi2wgaIRtzw+O25GserhwHSIx+57etZ8dhwxlK4UB5q8Mab7gbPZTfv4S6cRlk",
  watchers: [
    esbuild: {Esbuild, :install_and_run, [:app, ~w(--sourcemap=inline --watch)]},
    dartsass:
      {DartSass, :install_and_run,
       [:app, ~w(--embed-source-map --source-map-urls=absolute --watch)]}
  ]

config :grasstube, GrasstubeWeb.Endpoint,
  live_reload: [
    patterns: [
      ~r"priv/static/.*(js|css|png|jpeg|jpg|gif|svg)$",
      ~r"priv/gettext/.*(po)$",
      ~r"lib/grasstube_web/(live|views)/.*(ex)$",
      ~r"lib/grasstube_web/templates/.*(eex)$"
    ]
  ]

config :logger, :console, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20

config :phoenix, :plug_init_mode, :runtime
