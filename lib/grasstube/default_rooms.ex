defmodule Grasstube.DefaultRooms do
  use Task

  alias Grasstube.ChatAgent

  @default_videos ["https://www.youtube.com/watch?v=KrapzeD00w8"]

  def start_link(_) do
    Task.start_link(__MODULE__, :run, [])
  end

  def run() do
    Grasstube.ProcessRegistry.create_room("w", "jade room", "")

    playlist = Grasstube.ProcessRegistry.lookup("jade room", :playlist)
    Enum.each(@default_videos, &Grasstube.PlaylistAgent.add_queue(playlist, "", &1, "", %{}))

    chat = Grasstube.ProcessRegistry.lookup("jade room", :chat)
    ChatAgent.add_mod(chat, "clara")
    ChatAgent.add_mod(chat, "mathguy2357")
    ChatAgent.add_mod(chat, "cactus")
    ChatAgent.add_emotelist(chat, "w")
    ChatAgent.add_emotelist(chat, "clara")
    ChatAgent.add_emotelist(chat, "mathguy2357")
    ChatAgent.add_emotelist(chat, "cactus")

    case File.read("scripts/room.js") do
      {:ok, script} -> ChatAgent.set_script(chat, :room, script)
      _ -> nil
    end

    case File.read("scripts/playlist.js") do
      {:ok, script} -> ChatAgent.set_script(chat, :playlist, script)
      _ -> nil
    end
  end
end
