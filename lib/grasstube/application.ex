defmodule Grasstube.Application do
  use Application

  def start(_type, _args) do
    children = [
      Grasstube.Repo,
      Grasstube.Supervisor,
      GrasstubeWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: Grasstube.Supervisor]
    Supervisor.start_link(children, opts)
  end

  def config_change(changed, _new, removed) do
    GrasstubeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
