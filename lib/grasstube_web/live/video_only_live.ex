defmodule GrasstubeWeb.VideoOnlyLive do
  use GrasstubeWeb, :live_view

  import GrasstubeWeb.PageView

  def render(assigns) do
    ~L"""
    <%= live_render(@socket, GrasstubeWeb.VideoLive,
      session: %{"room" => @room},
      id: "view_video"
    ) %>
    """
  end

  def mount(%{"room" => room}, session, socket) do
    {:ok, assign(socket, room: room)}
  end
end
