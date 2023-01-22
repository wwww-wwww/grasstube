defmodule Grasstube.DefaultRooms do
  use Task

  def start_link(_) do
    Task.start_link(__MODULE__, :run, [])
  end

  def run() do
    Grasstube.Repo.all(Grasstube.Room)
    |> Grasstube.Repo.preload([:user, [emotelists: :emotes], :mods])
    |> Enum.map(&Grasstube.ProcessRegistry.start_room/1)
  end
end
