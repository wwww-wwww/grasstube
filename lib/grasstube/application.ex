defmodule Grasstube.Application do
  use Application

  def start(_type, _args) do
    children = [
      Grasstube.Repo,
      GrasstubeWeb.Endpoint,
      {Phoenix.PubSub,
       name: Grasstube.PubSub,
       adapter: Phoenix.PubSub.Redis,
       host: "127.0.0.1",
       node_name: "grasstube"},
      {Task.Supervisor, name: Tasks},
      GrasstubeWeb.Counter,
      Grasstube.YTCounter,
      Grasstube.ProcessRegistry,
      Grasstube.Presence,
      {DynamicSupervisor, name: Grasstube.DynamicSupervisor, strategy: :one_for_one},
      Grasstube.DefaultRooms
    ]

    opts = [strategy: :one_for_one, name: Grasstube.Supervisor]
    Supervisor.start_link(children, opts)
  end

  def config_change(changed, _new, removed) do
    GrasstubeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
