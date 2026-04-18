defmodule Grasstube.RoomAgent do
  use Agent

  alias Grasstube.{Repo}

  def start_link(room) do
    Agent.start_link(fn -> room |> Repo.preload(:mods) end,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def reload(pid), do: Agent.update(pid, &(Repo.reload(&1) |> Repo.preload(:mods, force: true)))

  def get(pid), do: Agent.get(pid, & &1)

  def controls?(pid, scope) do
    state = get(pid)

    cond do
      state.public_controls == true -> true
      scope.user == nil -> false
      state.user_id == scope.user.id -> true
      Enum.any?(state.mods, &(&1.id == scope.user.id)) -> true
    end
  end
end
