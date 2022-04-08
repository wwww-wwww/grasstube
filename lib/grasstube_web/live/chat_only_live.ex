defmodule GrasstubeWeb.ChatOnlyLive do
  use GrasstubeWeb, :live_view

  import GrasstubeWeb.PageView

  def render(assigns) do
    ~L"""
    <%= live_render(@socket, GrasstubeWeb.ChatLive,
      session: %{"room" => @room},
      id: "view_chat"
    ) %>
    """
  end

  def mount(%{"room" => room}, _session, socket) do
    {:ok, assign(socket, room: room)}
  end
end
