defmodule Grasstube.Presence do
  use Phoenix.Presence,
    otp_app: :grasstube,
    pubsub_server: Grasstube.PubSub

  def fetch(topic, presences) do
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
          user = Grasstube.Repo.get(Grasstube.User, username)

          {user.username,
           %{
             metas: metas,
             member: true,
             username: user.username,
             nickname: user.nickname
           }}
      end
    end
  end
end
