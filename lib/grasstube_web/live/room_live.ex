defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.LiveAuth

  def render(assigns) do
    GrasstubeWeb.PageView.render("room_live.html", assigns)
  end

  def mount(%{"room" => room}, _session, socket) do
    socket =
      socket
      |> assign(room: room)
      |> assign(script: Grasstube.ChatAgent.get_script(socket.assigns.chat, :room))

    {:ok, socket}
  end
end
