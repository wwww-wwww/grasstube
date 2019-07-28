defmodule GrasstubeWeb.Router do
  use GrasstubeWeb, :router

  pipeline :browser do
    plug(:accepts, ["html"])
    plug(:fetch_session)
    plug(:fetch_flash)
    plug(:protect_from_forgery)
    plug(:put_secure_browser_headers)
  end

  pipeline :api do
    plug(:accepts, ["json"])
  end

  scope "/", GrasstubeWeb do
    pipe_through(:browser)
    get("/", PageController, :index)
    get("/r/:room/chat", PageController, :chat)
    get("/r/:room/video", PageController, :video)
    get("/r/:room", PageController, :room)
  end
end
