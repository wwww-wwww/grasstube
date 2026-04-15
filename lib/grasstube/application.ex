defmodule Grasstube.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      GrasstubeWeb.Telemetry,
      Grasstube.Repo,
      {DNSCluster, query: Application.get_env(:grasstube, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Grasstube.PubSub},
      Grasstube.Counter,
      Grasstube.Presence,
      Grasstube.ProcessRegistry,
      {Task.Supervisor, name: Tasks},
      {DynamicSupervisor, name: Grasstube.DynamicSupervisor, strategy: :one_for_one},
      Grasstube.ExistingRooms,
      GrasstubeWeb.Endpoint
    ]

    :locus.start_loader(:country, "./geolite2-country.mmdb")

    opts = [strategy: :one_for_one, name: Grasstube.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    GrasstubeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
