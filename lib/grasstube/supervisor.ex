defmodule Grasstube.RoomSupervisor do
  use Supervisor, restart: :transient

  def start_link(opts) do
    room = opts |> Keyword.get(:room)

    Supervisor.start_link(__MODULE__, opts,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def init(opts) do
    room = Keyword.get(opts, :room)

    children = [
      {Grasstube.RoomAgent, room},
      {Grasstube.ChatAgent, room},
      {Grasstube.VideoAgent, room},
      {Grasstube.VideoScheduler, room},
      {Grasstube.PlaylistAgent, room},
      # {Grasstube.PollsAgent, room}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
