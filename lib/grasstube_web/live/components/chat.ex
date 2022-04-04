defmodule GrasstubeWeb.ChatComponent do
  use GrasstubeWeb, :live_component

  def render(assigns) do
    GrasstubeWeb.ComponentsView.render("chat.html", assigns)
  end
end
