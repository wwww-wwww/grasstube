defmodule GrasstubeWeb.NoVideoLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.RoomAuth

  def render(assigns) do
    GrasstubeWeb.PageView.render("no_video_live.html", assigns)
  end

  def mount(_params, _session, socket) do
    {:ok, socket}
  end
end
