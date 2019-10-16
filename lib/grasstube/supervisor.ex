defmodule Grasstube.Supervisor do
  use Supervisor

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, :ok, opts)
  end

  def init(:ok) do
    children = [
      {Task.Supervisor, name: Tasks},
      GrasstubeWeb.Counter,
      Grasstube.YTCounter,
      Grasstube.ProcessRegistry,
      {DynamicSupervisor, name: Grasstube.DynamicSupervisor, strategy: :one_for_one},
      Grasstube.DefaultRooms,
      worker(ChannelWatcher, [:rooms])
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end

defmodule Grasstube.RoomSupervisor do
  use Supervisor, restart: :transient
  
  def start_link(opts) do
    room_name = opts |> Keyword.get(:room_name)
    admin = opts |> Keyword.get(:admin)
    Supervisor.start_link(__MODULE__, opts, name: via_tuple(room_name, admin))
  end

  def init(opts) do
    room_name = opts |> Keyword.get(:room_name)

    children = [
      {GrasstubeWeb.ChatAgent, opts},
      {GrasstubeWeb.VideoAgent, room_name},
      {GrasstubeWeb.VideoScheduler, room_name},
      {GrasstubeWeb.PlaylistAgent, room_name},
      {GrasstubeWeb.PollsAgent, room_name}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
  
  def via_tuple(room_name, admin) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :supervisor}, admin)
  end
end

defmodule GrasstubeWeb.Counter do
  use Agent

  def start_link(_) do
    Agent.start_link(fn -> 0 end, name: __MODULE__)
  end

  def value do
    Agent.get(__MODULE__, & &1)
  end

  def increment do
    Agent.update(__MODULE__, &(&1 + 1))
  end
end

defmodule GrasstubeWeb.UserSocket do
  use Phoenix.Socket
  require Logger

  channel("chat:*", GrasstubeWeb.ChatChannel)
  channel("video:*", GrasstubeWeb.VideoChannel)
  channel("playlist:*", GrasstubeWeb.PlaylistChannel)
  channel("polls:*", GrasstubeWeb.PollsChannel)

  def connect(%{"token" => token}, socket, _) do
    case Guardian.Phoenix.Socket.authenticate(socket, Grasstube.Guardian, token) do
      {:ok, authed_socket} ->
        {:ok, authed_socket}
      _ -> :error
    end
  end

  def connect(_params, socket, _) do
    {:ok, socket}
  end

  def id(_socket) do
    ret = GrasstubeWeb.Counter.value()
    GrasstubeWeb.Counter.increment()
    Integer.to_string(ret)
  end
end

defmodule ChannelWatcher do
  use GenServer

  def monitor(server_name, pid, mfa) do
    GenServer.call(server_name, {:monitor, pid, mfa})
  end

  def demonitor(server_name, pid) do
    GenServer.call(server_name, {:demonitor, pid})
  end

  def start_link(name) do
    GenServer.start_link(__MODULE__, [], name: name)
  end

  def init(_) do
    Process.flag(:trap_exit, true)
    {:ok, %{channels: Map.new()}}
  end

  def handle_call({:monitor, pid, mfa}, _from, state) do
    Process.link(pid)
    {:reply, :ok, put_channel(state, pid, mfa)}
  end

  def handle_call({:demonitor, pid}, _from, state) do
    case Map.fetch(state.channels, pid) do
      :error ->
        {:reply, :ok, state}

      {:ok, _mfa} ->
        Process.unlink(pid)
        {:reply, :ok, drop_channel(state, pid)}
    end
  end

  def handle_info({:EXIT, pid, _reason}, state) do
    case Map.fetch(state.channels, pid) do
      :error ->
        {:noreply, state}

      {:ok, {mod, func, args}} ->
        Task.start_link(fn -> apply(mod, func, args) end)
        {:noreply, drop_channel(state, pid)}
    end
  end

  defp drop_channel(state, pid) do
    %{state | channels: Map.delete(state.channels, pid)}
  end

  defp put_channel(state, pid, mfa) do
    %{state | channels: Map.put(state.channels, pid, mfa)}
  end
end
