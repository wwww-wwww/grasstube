defmodule Grasstube.RoomSupervisor do
  use Supervisor, restart: :transient

  def start_link(opts) do
    room = opts |> Keyword.get(:room)
    Supervisor.start_link(__MODULE__, opts, name: via_tuple(room.title))
  end

  def init(opts) do
    room = Keyword.get(opts, :room)

    children = [
      {Grasstube.ChatAgent, room},
      {Grasstube.VideoAgent, room},
      {Grasstube.VideoScheduler, room},
      {Grasstube.PlaylistAgent, room},
      {Grasstube.PollsAgent, room}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  def via_tuple(room_name) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :supervisor})
  end
end

defmodule GrasstubeWeb.Counter do
  use Agent

  def start_link(_) do
    Agent.start_link(fn -> 0 end, name: __MODULE__)
  end

  def inc do
    Agent.get_and_update(__MODULE__, &{&1, &1 + 1})
  end
end

defmodule GrasstubeWeb.UserSocket do
  use Phoenix.Socket

  channel("chat:*", GrasstubeWeb.ChatChannel)
  channel("video:*", GrasstubeWeb.VideoChannel)
  channel("playlist:*", GrasstubeWeb.PlaylistChannel)
  channel("polls:*", GrasstubeWeb.PollsChannel)

  def connect(_, socket, _) do
    socket_id = new_id()

    {:ok,
     socket
     |> assign(:socket_id, socket_id)
     |> assign(:user_id, "$" <> socket_id)
     |> assign(:user, nil)}
  end

  def id(socket) do
    socket.assigns.socket_id
  end

  def new_id() do
    GrasstubeWeb.Counter.inc()
    |> Integer.to_string()
  end
end
