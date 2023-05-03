defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.RoomAuth

  def render(assigns) do
    GrasstubeWeb.PageView.render("room_live.html", assigns)
  end

  def mount(_params, _session, socket) do
    socket =
      socket
      |> assign(script: Grasstube.Room.get_attr(socket.assigns.chat, :room))

    {:ok, socket}
  end
end
