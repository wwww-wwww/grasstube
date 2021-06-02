defmodule GrasstubeWeb.LayoutView do
  use GrasstubeWeb, :view

  alias Grasstube.Guardian

  def get_user_links(socket, %{user: user}) when user != nil do
    [
      link(user.name, to: Routes.user_path(socket, :show_user, user.username)),
      link("sign out", to: Routes.user_path(socket, :sign_out))
    ]
  end

  def get_user_links(socket, _) do
    [
      link("sign in", to: Routes.user_path(socket, :sign_in)),
      link("sign up", to: Routes.user_path(socket, :sign_up))
    ]
  end

  def get_user_links(conn) do
    if Guardian.Plug.authenticated?(conn) and Guardian.Plug.current_resource(conn) != nil do
      user = Guardian.Plug.current_resource(conn)

      [
        link(user.name, to: Routes.user_path(conn, :show_user, user.username)),
        link("sign out", to: Routes.user_path(conn, :sign_out))
      ]
    else
      [
        link("sign in", to: Routes.user_path(conn, :sign_in)),
        link("sign up", to: Routes.user_path(conn, :sign_up))
      ]
    end
  end

  def title("room.html", b) do
    b.room
  end

  def title(_, _) do
    "grasstube 31"
  end
end
