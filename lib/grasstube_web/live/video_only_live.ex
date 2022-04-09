defmodule GrasstubeWeb.VideoOnlyLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.LiveAuth

  def render(assigns) do
    ~L"""
    <%= live_render(@socket, GrasstubeWeb.VideoLive,
      session: %{"room" => @room, "current_user" => @current_user, "chat" => @chat},
      id: "view_video"
    ) %>
    """
  end

  def mount(%{"room" => room}, _session, socket) do
    {:ok, assign(socket, room: room)}
  end
end
