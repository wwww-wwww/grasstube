defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  alias Grasstube.Guardian
  alias GrasstubeWeb.ChatAgent

  def index(conn, _) do
    render(conn, "index.html", can_make_room: can_make_room?(conn))
  end

  def chat(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      chat ->
        render(conn, "chat_only.html", room: room, room_has_password: password_required?(conn, chat))
    end
  end

  def no_video(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      chat ->
        render(conn, "no_video.html", room: room, room_has_password: password_required?(conn, chat))
    end
  end

  def video(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      chat ->
        render(conn, "video.html", room: room, room_has_password: password_required?(conn, chat))
    end
  end

  def room(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      chat ->
        render(conn, "room.html", room: room, room_has_password: password_required?(conn, chat))
    end
  end

  def controls(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        text(conn, "room not found")
      chat ->
        render(conn, "controls.html", room: room, room_has_password: password_required?(conn, chat))
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
      Map.put(acc, name, Grasstube.Presence.list("chat:#{name}") |> Enum.count())
    end))
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

  def password_required?(conn, chat) do
    not (Guardian.Plug.authenticated?(conn) and
      GrasstubeWeb.ChatAgent.mod?(chat, Guardian.Plug.current_resource(conn))) and ChatAgent.password?(chat)
  end
end
