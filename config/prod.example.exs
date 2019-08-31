use Mix.Config

config :grasstube, Grasstube.Repo,
  username: "grasstube",
  password: "grasstube",
  database: "grasstube",
  hostname: "192.168.1.51",
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

config :grasstube, GrasstubeWeb.Endpoint,
  http: [:inet6, port: System.get_env("PORT") || 4001],
  url: [host: "o.okea.moe", port: 80],
  cache_static_manifest: "priv/static/cache_manifest.json",
  static_url: [path: "/"]

config :logger, level: :info

import_config "prod.secret.exs"
