defmodule Grasstube.ProcessRegistry do
  def start_link do
    Registry.start_link(keys: :unique, name: __MODULE__)
  end

  def via_tuple(key) do
    {:via, Registry, {__MODULE__, key}}
  end

  def child_spec(_) do
    Supervisor.child_spec(
      Registry,
      id: __MODULE__,
      start: {__MODULE__, :start_link, []}
    )
  end

  def lookup(room_name, channel) do
    case GrasstubeWeb.Registry.lookup(room_name) do
      {:ok, _} ->
        [{pid, _}] = Registry.lookup(__MODULE__, {room_name, channel})
        pid
      _ ->
        :not_found
    end
  end
end