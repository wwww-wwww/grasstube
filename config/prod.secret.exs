use Mix.Config

config :grasstube, GrasstubeWeb.Endpoint,
  secret_key_base: ""

config :grasstube, Grasstube.Guardian,
  issuer: "Grasstube",
  secret_key: ""