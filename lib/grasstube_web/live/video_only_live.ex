defmodule GrasstubeWeb.VideoOnlyLive do
  use GrasstubeWeb, :live_view

  import GrasstubeWeb.PageView

  def render(assigns) do
    ~L"""
    <%= live_render(@socket, GrasstubeWeb.VideoLive,
      session: %{"room" => @room},
      id: "video:#{@room}",
      container: {:div, class: page_name(@socket)}
    ) %>
    """
  end

  def mount(%{"room" => room}, session, socket) do
    {:ok, assign(socket, room: room)}
  end
end
