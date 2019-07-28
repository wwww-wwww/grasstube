defmodule Grasstube.DefaultRooms do
  use Task

  @default_rooms ["main", "a", "b"]
  @default_videos ["https://www.youtube.com/watch?v=6TFeGkjN6Rc", "https://www.youtube.com/watch?v=nJz57eIwRZo"]

  def start_link(_) do
    Task.start_link(__MODULE__, :run, [])
  end

  def run() do
    Enum.each(@default_rooms, &(GrasstubeWeb.Registry.create(&1)))
    playlist = Grasstube.ProcessRegistry.lookup("main", :playlist)
    Enum.each(@default_videos, &(GrasstubeWeb.PlaylistAgent.q_add(playlist, &1, "", "")))
  end
end