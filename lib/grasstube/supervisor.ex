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
        socket_id = new_id()

        {:ok,
         authed_socket
         |> assign(:socket_id, socket_id)
         |> assign(:user_id, Guardian.Phoenix.Socket.current_resource(authed_socket).username)}

      _ ->
        :error
    end
  end

  def connect(_, socket, _) do
    socket_id = new_id()

    {:ok,
     socket
     |> assign(:socket_id, socket_id)
     |> assign(:user_id, "$" <> socket_id)}
  end

  def id(socket) do
    socket.assigns.socket_id
  end

  def new_id() do
    ret = GrasstubeWeb.Counter.value()
    GrasstubeWeb.Counter.increment()
    Integer.to_string(ret)
  end
end
