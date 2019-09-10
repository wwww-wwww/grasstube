defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  def chat(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "chat.html", room: room)
    end
  end

  def video(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :video) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "video.html", room: room)
    end
  end

  def room(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "room.html", room: room)
    end
  end

  def emotes(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        json(conn, %{success: false, message: "room not found"})
      chat ->
        emotes = GrasstubeWeb.ChatAgent.get_emotes(chat)
        json(conn, %{success: true, emotes: emotes})
    end
  end

  def list_rooms(conn, _) do
    room_names = Grasstube.ProcessRegistry.list_rooms()
    json(conn, room_names |> Enum.reduce(%{}, fn name, acc ->
      case Grasstube.ProcessRegistry.lookup(name, :chat) do
        :not_found ->
          acc
        chat ->
          Map.put(acc, name, GrasstubeWeb.ChatAgent.get_users(chat) |> length)
      end
    end)
    )
  end
end
