defmodule Grasstube.DefaultRooms do
  use Task

  @default_videos ["https://www.youtube.com/watch?v=KrapzeD00w8"]

  def start_link(_) do
    Task.start_link(__MODULE__, :run, [])
  end

  def run() do
    Grasstube.ProcessRegistry.create_room("w", "jade room", "")

    playlist2 = Grasstube.ProcessRegistry.lookup("jade room", :playlist)
    Enum.each(@default_videos, &Grasstube.PlaylistAgent.add_queue(playlist2, "", &1, "", %{}))

    chat2 = Grasstube.ProcessRegistry.lookup("jade room", :chat)
    Grasstube.ChatAgent.add_mod(chat2, "clara")
    Grasstube.ChatAgent.add_mod(chat2, "mathguy2357")
    Grasstube.ChatAgent.add_emotelist(chat2, "w")
    Grasstube.ChatAgent.add_emotelist(chat2, "clara")
    Grasstube.ChatAgent.add_emotelist(chat2, "mathguy2357")
  end
end
