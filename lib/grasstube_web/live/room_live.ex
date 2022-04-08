defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view

  def render(assigns) do
    GrasstubeWeb.PageView.render("room_live.html", assigns)
  end

  def mount(%{"room" => room}, _session, socket) do
    {:ok, assign(socket, room: room)}
  end
end
