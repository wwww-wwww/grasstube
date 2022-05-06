defmodule GrasstubeWeb.ChatOnlyLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.RoomAuth

  def render(assigns) do
    ~L"""
    <%= live_render(@socket, GrasstubeWeb.ChatLive,
      session: %{"room" => @room, "current_user" => @current_user, "chat" => @chat},
      id: "view_chat"
    ) %>
    """
  end

  def mount(_params, _session, socket) do
    {:ok, socket}
  end
end
