defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.LiveAuth

  def render(assigns) do
    GrasstubeWeb.PageView.render("room_live.html", assigns)
  end

  def mount(%{"room" => room}, session, socket) do
    IO.inspect("room_live #{inspect(socket.assigns)}")
    {:ok, assign(socket, room: room)}
  end
end
