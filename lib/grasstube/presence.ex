defmodule Grasstube.Presence do
  use Phoenix.Presence,
    otp_app: :grasstube,
    pubsub_server: Grasstube.PubSub

  def fetch(_topic, presences) do
    for {key, %{metas: metas}} <- presences, into: %{} do
      case key do
        "$" <> id ->
          {key,
           %{
             metas: metas,
             member: false,
             id: id
           }}

        username ->
          {key,
           %{
             metas: metas,
             member: true,
             username: username,
             nickname: username
           }}
      end
    end
  end

  def add_nicknames(presences) do
    users =
      presences
      |> Map.keys()
      |> Enum.filter(&(not String.starts_with?(&1, "$")))
      |> case do
        [] -> %{}
        usernames -> Grasstube.Accounts.get_users_nicknames_map(usernames)
      end

    for {key, u} <- presences, into: %{} do
      case key do
        "$" <> _id -> {key, u}
        username -> {key, %{u | nickname: users[username]}}
      end
    end
  end

  def list_with_nicknames(topic), do: list(topic) |> add_nicknames
end
