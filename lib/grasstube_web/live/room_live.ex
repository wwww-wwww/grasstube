defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.RoomAuth
  on_mount GrasstubeWeb.RoomActivity

  alias Grasstube.Presence

  def render(assigns) do
    GrasstubeWeb.PageView.render("room_live.html", assigns)
  end

  def mount(_params, _session, socket) do
    topic = "room:#{socket.assigns.room.id}"

    user_id =
      if connected?(socket) do
        {user_id, meta} =
          case socket.assigns.current_user do
            %Grasstube.User{username: username} -> {username, %{}}
            "$" <> user_id -> {socket.assigns.current_user, %{nickname: "anon#{user_id}"}}
          end

        Presence.track(self(), topic, user_id, meta)
        user_id
      else
        nil
      end

    # IO.inspect(socket.assigns)

    chat = Grasstube.ChatAgent.get(socket.assigns.chat_pid)

    room_pid = Grasstube.ProcessRegistry.get(socket.assigns.room.id, Grasstube.RoomAgent)

    emotes = Grasstube.RoomAgent.emotes(room_pid)

    socket =
      socket
      |> assign(user_id: user_id)
      |> assign(hide_header: true)
      |> assign(chat: chat)
      |> assign(room_pid: room_pid)
      |> assign(emotes: emotes)
      |> assign(script: Grasstube.Room.get_attr(chat, :room))

    {:ok, socket}
  end
end
