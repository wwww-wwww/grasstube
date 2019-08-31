defmodule Grasstube.DefaultRooms do
  use Task

  @default_rooms ["main"]
  @default_videos ["https://www.youtube.com/watch?v=KrapzeD00w8"]

  def start_link(_) do
    Task.start_link(__MODULE__, :run, [])
  end

  def run() do
    Enum.each(@default_rooms, &(Grasstube.ProcessRegistry.create_room(&1, "wow")))
    playlist = Grasstube.ProcessRegistry.lookup("main", :playlist)
    Enum.each(@default_videos, &(GrasstubeWeb.PlaylistAgent.q_add(playlist, &1, "", "")))
    chat = Grasstube.ProcessRegistry.lookup("main", :chat)
    GrasstubeWeb.ChatAgent.add_mod(chat, "wow2")
    GrasstubeWeb.ChatAgent.add_emotelist(chat, "ww")
  end
end
