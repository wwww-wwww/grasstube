defmodule GrasstubeWeb.UserView do
  use GrasstubeWeb, :view

  alias Grasstube.Guardian
  alias Grasstube.Repo

  def get_emotes(username) do
    user = Repo.get(Grasstube.User, username) |> Repo.preload(:emotes)

    user.emotes
    |> Enum.map(fn emote -> %{id: emote.id, emote: emote.emote, url: emote.url} end)
    |> Enum.sort_by(fn e -> e.emote end)
  end

  def get_rooms(conn) do
    user = Guardian.Plug.current_resource(conn)
    Grasstube.ProcessRegistry.rooms_of(user.username)
  end

  def title("sign_up.html", _) do
    "grasstube 31 - sign up"
  end

  def title("sign_in.html", _) do
    "grasstube 31 - sign in"
  end

  def title(_, _) do
    "grasstube 31"
  end
end
