defmodule GrasstubeWeb.PlaylistComponent do
  use GrasstubeWeb, :live_component

  def render(assigns) do
    ~H"""
    <div>
    </div>
    """
  end

  def update(assigns, socket) do
    # IO.inspect(assigns)
    socket = assign(socket, assigns)
    {:ok, socket}
  end

end
