defmodule GrasstubeWeb.Supervisor do
  use Supervisor

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, :ok, opts)
  end

  def init(:ok) do
    children = [
      {Task.Supervisor, name: Tasks},
      GrasstubeWeb.Counter,
      Grasstube.ProcessRegistry,
      {GrasstubeWeb.Registry, name: GrasstubeWeb.Registry},
      {DynamicSupervisor, name: Grasstube.DynamicSupervisor, strategy: :one_for_one},
      Grasstube.DefaultRooms,
      worker(ChannelWatcher, [:rooms])
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end

defmodule GrasstubeWeb.RoomSupervisor do
  use Supervisor
  
  def start_link(room_name) do
    Supervisor.start_link(__MODULE__, room_name)
  end

  def init(room_name) do
    children = [
      {GrasstubeWeb.ChatAgent, room_name},
      {GrasstubeWeb.VideoAgent, room_name},
      {GrasstubeWeb.VideoScheduler, room_name},
      {GrasstubeWeb.PlaylistAgent, room_name},
      {GrasstubeWeb.PollsAgent, room_name}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end

defmodule GrasstubeWeb.Registry do
  use GenServer

  def start_link(opts) do
    GenServer.start_link(__MODULE__, :ok, opts)
  end

  def init(:ok) do
    names = %{}
    refs = %{}
    {:ok, {names, refs}}
  end
  
  def handle_call({:lookup, name}, _from, state) do
    {names, _} = state
    {:reply, Map.fetch(names, name), state}
  end

  def handle_call({:list}, _from, state) do
    {names, _} = state
    {:reply, Map.keys(names), state}
  end

  def handle_cast({:create, name}, {names, refs}) do
    if Map.has_key?(names, name) do
      {:noreply, {names, refs}}
    else
      {:ok, pid} = DynamicSupervisor.start_child(Grasstube.DynamicSupervisor, {GrasstubeWeb.RoomSupervisor, room_name: name})
      ref = Process.monitor(pid)
      refs = Map.put(refs, ref, name)
      names = Map.put(names, name, pid)
      {:noreply, {names, refs}}
    end
  end

  def handle_info({:DOWN, ref, :process, _pid, _reason}, {names, refs}) do
    {name, refs} = Map.pop(refs, ref)
    names = Map.delete(names, name)
    {:noreply, {names, refs}}
  end
  
  def handle_info(_msg, state) do
    {:noreply, state}
  end

  @doc """
  Looks up the bucket pid for `name` stored in `server`.

  Returns `{:ok, pid}` if the bucket exists, `:error` otherwise.
  """
  def lookup(name) do
    GenServer.call(__MODULE__, {:lookup, name})
  end

  def list() do
    GenServer.call(__MODULE__, {:list})
  end

  @doc """
  Ensures there is a bucket associated with the given `name` in `server`.
  """
  def create(name) do
    GenServer.cast(__MODULE__, {:create, name})
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

  def connect(_params, socket, _connect_info) do
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
