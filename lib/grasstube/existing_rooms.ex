defmodule Grasstube.ExistingRooms do
  use Task

  def start_link(_) do
    Task.start_link(__MODULE__, :run, [])
  end

  def run() do
    Grasstube.Repo.all(Grasstube.Room)
    |> Grasstube.Repo.preload([:user])
    |> Enum.each(&Grasstube.ProcessRegistry.start_room/1)
  end
end
