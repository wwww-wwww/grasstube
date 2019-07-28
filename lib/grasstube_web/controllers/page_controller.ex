defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  def index(conn, _params) do
    room_names = GrasstubeWeb.Registry.list()
    rooms = room_names |> Enum.map(fn room ->
      chat = Grasstube.ProcessRegistry.lookup(room, :chat)
      {GrasstubeWeb.ChatAgent.get_users(chat) |> length, room}
    end) |> Enum.sort_by(&{-elem(&1, 0), elem(&1, 1)})

    render(conn, "index.html", name: "index", rooms: rooms)
  end

  def chat(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "chat.html", room: room, name: "chat")
    end
  end

  def video(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :video) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "video.html", room: room, name: "video")
    end
  end

  def room(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "room.html", room: room, name: "room")
    end
  end
end
