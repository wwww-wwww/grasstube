defmodule Grasstube.Presence do
  use Phoenix.Presence,
    otp_app: :grasstube,
    pubsub_server: Grasstube.PubSub

  def fetch(_topic, presences) do
    users =
      presences
      |> Map.keys()
      |> Enum.filter(&(not String.starts_with?(&1, "$")))
      |> case do
        [] -> %{}
        usernames -> Grasstube.Accounts.get_users_nicknames_map(usernames)
      end

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
             nickname: users[username]
           }}
      end
    end
  end
end
