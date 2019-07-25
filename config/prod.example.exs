use Mix.Config

config :grasstube, GrasstubeWeb.Endpoint,
  http: [:inet6, port: System.get_env("PORT") || 4001],
  url: [host: "o.okea.moe", port: 80],
  cache_static_manifest: "priv/static/cache_manifest.json",
  static_url: [path: "/"]

config :logger, level: :info

import_config "prod.secret.exs"
