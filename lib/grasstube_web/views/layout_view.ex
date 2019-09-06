defmodule GrasstubeWeb.LayoutView do
  use GrasstubeWeb, :view

  alias Grasstube.Guardian

  def get_user_links(conn) do
    if Guardian.Plug.authenticated?(conn) and Guardian.Plug.current_resource(conn) != nil do
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
