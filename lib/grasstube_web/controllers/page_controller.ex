defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  def index(conn, _params) do
    conn
    |> assign(:name, "index")
    |> live_render(GrasstubeWeb.RoomListView, session: %{})
  end

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

defmodule GrasstubeWeb.RoomListView do
  use Phoenix.LiveView

  def render(assigns) do
    Phoenix.View.render(GrasstubeWeb.PageView, "index.html", assigns)
  end

  def get_rooms() do
    room_names = Grasstube.ProcessRegistry.list_rooms()
    room_names |> Enum.reduce([], fn name, acc ->
      case Grasstube.ProcessRegistry.lookup(name, :chat) do
        :not_found ->
          acc
        chat ->
          [{name, GrasstubeWeb.ChatAgent.get_users(chat) |> length} | acc]
      end
    end) |> Enum.sort_by(&{-elem(&1, 1), elem(&1, 0)})
  end

  def mount(_session, socket) do
    if connected?(socket), do: Process.send_after(self(), :tick, 5000)
    {:ok, assign(socket, rooms: get_rooms())}
  end

  def handle_info(:tick, socket) do
    Process.send_after(self(), :tick, 5000)
    {:noreply, assign(socket, rooms: get_rooms())}
  end
end
