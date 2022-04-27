import Config

config :grasstube, Grasstube.Repo,
  username: "grasstube",
  password: "grasstube",
  database: "grasstube",
  hostname: "192.168.1.51",
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

config :grasstube,
  youtube_api_keys: []

config :grasstube, GrasstubeWeb.Endpoint,
  http: [:inet6, port: System.get_env("PORT") || 4001],
  url: [host: "tube.grass.moe"],
  cache_static_manifest: "priv/static/cache_manifest.json",
  static_url: [path: "/"],
  secret_key_base: "tZqi2wgaIRtzw+O25GserhwHSIx+57etZ8dhwxlK4UB5q8Mab7gbPZTfv4S6cRlk"

config :logger, level: :info
