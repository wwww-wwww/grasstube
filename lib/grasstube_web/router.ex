defmodule GrasstubeWeb.Router do
  use GrasstubeWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, {GrasstubeWeb.LayoutView, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :auth do
    plug Grasstube.Pipeline
  end

  pipeline :logged_in do
    plug Guardian.Plug.EnsureAuthenticated
  end

  pipeline :logged_out do
    plug Guardian.Plug.EnsureNotAuthenticated
  end

  pipeline :room_exists do
    plug GrasstubeWeb.Plug.RoomExists
  end

  pipeline :room_auth do
    plug GrasstubeWeb.Plug.RoomAuth
  end

  scope "/", GrasstubeWeb do
    pipe_through [:browser, :auth]

    live "/", RoomsLive
    get "/gdrive", PageController, :gdrive

    scope "/r" do
      get "/:room/controls", PageController, :controls
      get "/:room/chat", PageController, :chat
      get "/:room/no_video", PageController, :no_video
      get "/:room/video", PageController, :video
      get "/:room", PageController, :room
    end

    scope "/r2" do
      pipe_through :room_exists
      live "/:room/auth", AuthLive

      scope "/" do
        pipe_through :room_auth
        live "/:room/chat", ChatOnlyLive
        live "/:room/video", VideoOnlyLive
        live "/:room", RoomLive
      end
    end

    scope "/" do
      pipe_through :logged_out
      get "/sign_in", UserController, :sign_in_page
      post "/sign_in", UserController, :sign_in

      get "/sign_up", UserController, :sign_up_page
      post "/sign_up", UserController, :sign_up
    end

    get "/sign_out", UserController, :sign_out
    get "/u/:username", UserController, :show_user

    scope "/" do
      pipe_through :logged_in
      post "/add_emote", UserController, :add_emote
      post "/import_emotes", UserController, :import_emotes
      post "/delete_emote", UserController, :delete_emote
      get "/create_room", UserController, :create_room_page
      post "/create_room", UserController, :create_room
      post "/close_room", UserController, :close_room
    end

    scope "/api" do
      pipe_through :api
      post "/auth", UserController, :auth
      get "/list_rooms", PageController, :list_rooms
      get "/emotes/r/:room", PageController, :emotes
      get "/emotes/u/:username", UserController, :emotes_json
      get "/yt_search", YTController, :yt_search
    end
  end

  if Mix.env() in [:dev, :test] do
    import Phoenix.LiveDashboard.Router

    scope "/" do
      pipe_through :browser
      live_dashboard "/dashboard", metrics: GrasstubeWeb.Telemetry
    end
  end
end
