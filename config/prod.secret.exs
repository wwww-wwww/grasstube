use Mix.Config

config :grasstube, GrasstubeWeb.Endpoint,
  secret_key_base: ""

config :grasstube, Grasstube.Guardian,
  issuer: "Grasstube",
  secret_key: "",
  ttl: { 30, :days }

config :grasstube,
  youtube_api_keys: [
  ]
