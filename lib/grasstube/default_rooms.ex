defmodule Grasstube.DefaultRooms do
  use Task

  @default_videos ["https://www.youtube.com/watch?v=KrapzeD00w8"]

  def start_link(_) do
    Task.start_link(__MODULE__, :run, [])
  end

  def run() do
    Grasstube.ProcessRegistry.create_room("main", "w")
    chat = Grasstube.ProcessRegistry.lookup("main", :chat)

    Grasstube.ProcessRegistry.create_room("not main", "w")

    playlist2 = Grasstube.ProcessRegistry.lookup("not main", :playlist)
    Enum.each(@default_videos, &(GrasstubeWeb.PlaylistAgent.q_add(playlist2, &1, "", "")))
    
    chat2 = Grasstube.ProcessRegistry.lookup("not main", :chat)
    #GrasstubeWeb.ChatAgent.add_mod(chat2, "clara")
    #GrasstubeWeb.ChatAgent.add_mod(chat2, "mathguy2357")
    #GrasstubeWeb.ChatAgent.add_emotelist(chat2, "w")
    #GrasstubeWeb.ChatAgent.add_emotelist(chat2, "clara")
    #GrasstubeWeb.ChatAgent.add_emotelist(chat2, "mathguy2357")
  end
end
