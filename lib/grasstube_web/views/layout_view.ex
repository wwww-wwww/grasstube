defmodule GrasstubeWeb.LayoutView do
  use GrasstubeWeb, :view

  alias Grasstube.Guardian

  def get_user(conn) do
    if Guardian.Plug.authenticated?(conn) do
      user = Guardian.Plug.current_resource(conn)
      [
        link(user.username, to: "/user/#{user.username}"),
        link("sign out", to: "/sign_out")
      ]
    else
      [
        link("sign in", to: "/sign_in"),
        link("sign up", to: "/sign_up")
      ]
    end
  end
end
