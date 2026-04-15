defmodule GrasstubeWeb.Router do
  use GrasstubeWeb, :router

  import GrasstubeWeb.UserAuth

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {GrasstubeWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :fetch_current_scope_for_user
    plug :fetch_geo
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  # Enable LiveDashboard in development
  if Application.compile_env(:grasstube, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: GrasstubeWeb.Telemetry
    end
  end

  scope "/", GrasstubeWeb do
    pipe_through [:browser, :require_authenticated_user]

    live_session :require_authenticated_user,
      on_mount: [{GrasstubeWeb.UserAuth, :require_authenticated}] do
      live "/user/settings", UserLive.Settings, :edit

      live "/create-room", RoomCreateLive
    end

    post "/user/update-password", UserSessionController, :update_password
  end

  scope "/", GrasstubeWeb do
    pipe_through [:browser]

    live_session :current_user,
      on_mount: [{GrasstubeWeb.UserAuth, :mount_current_scope}] do
      live "/", IndexLive
      live "/room/:name", RoomLive

      live "/user/register", UserLive.Registration, :new
      live "/user/log-in", UserLive.Login, :new
    end

    post "/user/log-in", UserSessionController, :create
    delete "/user/log-out", UserSessionController, :delete
  end
end
