defmodule GrasstubeWeb.VideoChannel do
  use Phoenix.Channel
  require Logger

  alias GrasstubeWeb.VideoAgent

  def join("video:0", _message, socket) do
    send(self(), {:after_join, nil})
    {:ok, socket}
  end

  def handle_info({:after_join, _}, socket) do
    current = VideoAgent.get_current_video()

    if current != :nothing do
      push(socket, "setvid", %{
        id: current.id,
        type: current.type,
        url: current.url,
        sub: current.sub,
        small: current.small
      })

      current_time = VideoAgent.get_time()
      push(socket, "seek", %{t: current_time})
      
      push(socket, "playing", %{playing: VideoAgent.playing?()})
    end

    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end
end
