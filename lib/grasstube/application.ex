defmodule Grasstube.Application do
  use Application

  def start(_type, _args) do
    children = [
      Grasstube.Repo,
      {Phoenix.PubSub,
       name: Grasstube.PubSub,
       adapter: Phoenix.PubSub.Redis,
       host: "127.0.0.1",
       node_name: "grasstube"},
      Grasstube.Presence,
      {Task.Supervisor, name: Tasks},
      GrasstubeWeb.Counter,
      Grasstube.YTCounter,
      Grasstube.ProcessRegistry,
      {DynamicSupervisor, name: Grasstube.DynamicSupervisor, strategy: :one_for_one},
      Grasstube.DefaultRooms,
      Grasstube.Instances,
      GrasstubeWeb.Endpoint,
      {Nostrum.Bot,
       %{
         name: DiscordBot,
         consumer: Grasstube.Consumer,
         intents: [:direct_messages, :guild_messages, :message_content],
         wrapped_token: fn -> System.fetch_env!("BOT_TOKEN") end
       }}
    ]

    opts = [strategy: :one_for_one, name: Grasstube.Supervisor]
    Supervisor.start_link(children, opts)
  end

  def config_change(changed, _new, removed) do
    GrasstubeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
