defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  alias Grasstube.Guardian

  def index(conn, _) do
    live_render(conn, GrasstubeWeb.RoomsLive, session: %{can_make_room: can_make_room?(conn)})
  end

  def chat(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "chat.html", room: room)
    end
  end

  def no_video(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :video) do
      :not_found ->
        text(conn, "room not found")
      _ ->
        render(conn, "no_video.html", room: room)
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

  def can_make_room?(conn) do
    if Guardian.Plug.authenticated?(conn) and Guardian.Plug.current_resource(conn) != nil do
      user = Guardian.Plug.current_resource(conn)
      rooms = Grasstube.ProcessRegistry.rooms_of(user.username)
      length(rooms) == 0
    else
      false
    end
  end
end
