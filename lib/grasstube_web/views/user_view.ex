defmodule GrasstubeWeb.UserView do
  use GrasstubeWeb, :view

  import Ecto.Query, only: [from: 2]

  alias Grasstube.Guardian
  alias Grasstube.Repo

  def get_emotes(username) do
    user = Repo.get(Grasstube.User, username) |> Repo.preload(:emotes)
    user.emotes |> Enum.map(fn emote -> %{id: emote.id, emote: emote.emote, url: emote.url} end)
  end

end
