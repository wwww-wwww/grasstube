defmodule GrasstubeWeb.Router do
  use GrasstubeWeb, :router

  pipeline :browser do
    plug(:accepts, ["html"])
    plug(:fetch_session)
    plug(:fetch_flash)
    plug(:protect_from_forgery)
    plug(:put_secure_browser_headers)
    
    plug(:fetch_flash)
    plug(Phoenix.LiveView.Flash)
  end

  pipeline :api do
    plug(:accepts, ["json"])
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

  scope "/", GrasstubeWeb do
    pipe_through([:browser, :auth])
    
    get("/", PageController, :index)
    get("/r/:room/chat", PageController, :chat)
    get("/r/:room/video", PageController, :video)
    get("/r/:room", PageController, :room)

    scope "/" do
      pipe_through :logged_out
      get "/sign_in", UserController, :sign_in_page
      post "/sign_in", UserController, :sign_in

      get "/sign_up", UserController, :sign_up_page
      post "/sign_up", UserController, :sign_up
    end

    get "/sign_out", UserController, :sign_out
    
    get "/user/:username", UserController, :show_user

    scope "/" do
      pipe_through :logged_in
      post "/add_emote", UserController, :add_emote
      post "/delete_emote", UserController, :delete_emote
    end

    scope "/api" do
      pipe_through(:api)
      get("/list_rooms", PageController, :list_rooms)
      get("/emotes/r/:room", PageController, :emotes)
    end

  end
end
