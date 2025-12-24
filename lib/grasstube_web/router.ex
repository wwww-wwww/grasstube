defmodule GrasstubeWeb.Router do
  use GrasstubeWeb, :router

  import GrasstubeWeb.UserAuth

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, {GrasstubeWeb.LayoutView, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :fetch_current_user
    plug :fetch_geo
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", GrasstubeWeb do
    pipe_through :browser

    live_session :default, on_mount: GrasstubeWeb.UserAuth do
      live "/", RoomsLive
      get "/gdrive", PageController, :gdrive

      scope "/r" do
        live "/:room/auth", AuthLive

        live "/:room", RoomLive

        scope "/" do
          pipe_through :require_authenticated_user

          live "/:room/edit", EditRoomLive
        end
      end

      scope "/" do
        pipe_through :redirect_if_user_is_authenticated

        live "/sign_in", SignInLive
        post "/sign_in", UserController, :sign_in

        live "/sign_up", SignUpLive
        post "/sign_up", UserController, :sign_up
      end

      live "/u/:username", UserLive

      scope "/" do
        pipe_through :require_authenticated_user

        live "/create_room", CreateRoomLive

        post "/add_emote", UserController, :add_emote
        post "/import_emotes", UserController, :import_emotes
        post "/delete_emote", UserController, :delete_emote
        post "/create_room", UserController, :create_room
        post "/close_room", UserController, :close_room
      end
    end

    get "/sign_out", UserController, :sign_out
    get "/emote/:id", UserController, :emote

    scope "/api" do
      pipe_through :api

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
