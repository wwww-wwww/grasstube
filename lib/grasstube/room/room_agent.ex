defmodule Grasstube.RoomAgent do
  use Agent

  def start_link(room) do
    Agent.start_link(fn -> room end,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def get(pid), do: Agent.get(pid, & &1)
end
