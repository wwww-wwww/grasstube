defmodule GrasstubeWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :grasstube

  socket "/tube", GrasstubeWeb.UserSocket,
    websocket: true,
    longpoll: false

  @session_options [
    store: :cookie,
    key: "_grasstube_key",
    signing_salt: "gvBU6+ko",
    max_age: 604_800
  ]

  socket "/live",
         Phoenix.LiveView.Socket,
         websocket: [connect_info: [session: @session_options]]

  # Serve at "/" the static files from "priv/static" directory.
  #
  # You should set gzip to true if you are running phx.digest
  # when deploying your static files in production.
  plug Plug.Static,
    at: "/",
    from: :grasstube,
    gzip: false,
    content_types: %{"subtitles-octopus-worker.wasm" => "application/wasm"}

  # Code reloading can be explicitly enabled under the
  # :code_reloader configuration of your endpoint.
  if code_reloading? do
    socket("/phoenix/live_reload/socket", Phoenix.LiveReloader.Socket)
    plug(Phoenix.LiveReloader)
    plug(Phoenix.CodeReloader)
  end

  plug Plug.RequestId
  plug Plug.Logger

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug GrasstubeWeb.Router
end
