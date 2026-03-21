defmodule Grasstube.RoomAgent do
  use Agent

  alias Grasstube.{Room}

  def start_link(room) do
    Agent.start_link(
      fn ->
        room
        |> Grasstube.Repo.preload([:user, :mods, [emotelists: :emotes]])
      end,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def update(pid, room), do: Agent.update(pid, fn -> room end)

  def get(pid), do: Agent.get(pid, & &1)

  def emotes(%Room{} = room) do
    room
    |> Map.get(:emotelists)
    |> Enum.map(fn user ->
      Enum.map(user.emotes, fn emote ->
        url =
          if Application.get_env(:grasstube, :serve_emotes),
            do: GrasstubeWeb.Router.Helpers.user_path(Endpoint, :emote, emote.id),
            else: emote.url

        %{emote: emote.emote, id: emote.id, url: url}
      end)
    end)
    |> List.flatten()
    |> Enum.sort_by(&Map.get(&1, :emote))
  end

  def mod?(_, "$" <> _id), do: false

  def mod?(_, nil), do: false

  def mod?(%Room{user: admin, mods: mods}, user) when is_bitstring(user),
    do: admin.username == user or Enum.any?(mods, &(&1.username == user))

  def mod?(%Room{} = room, %{username: username}), do: mod?(room, username)

  def public_controls?(%Room{public_controls: public_controls}), do: public_controls

  def controls?(%Room{} = room, %{assigns: %{user: user}}), do: controls?(room, user)

  def controls?(%Room{} = room, user), do: public_controls?(room) or mod?(room, user)
end
