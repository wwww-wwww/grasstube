defmodule GrasstubeWeb.VideoChannel do
  use Phoenix.Channel

  alias GrasstubeWeb.VideoAgent

  def join("video:" <> room_name, _message, socket) do
    case Grasstube.ProcessRegistry.lookup(room_name, :video) do
      :not_found ->
        {:error, "no room"}
      _channel ->
        send(self(), {:after_join, nil})
        {:ok, socket}
    end
  end

  def handle_info({:after_join, _}, socket) do
    "video:" <> room_name = socket.topic
    video = Grasstube.ProcessRegistry.lookup(room_name, :video)
    
    current = VideoAgent.get_current_video(video)

    if current != :nothing do
      push(socket, "setvid", %{
        id: current.id,
        type: current.type,
        url: current.url,
        sub: current.sub,
        small: current.small
      })

      current_time = VideoAgent.get_time(video)
      push(socket, "seek", %{t: current_time})
      
      push(socket, "playing", %{playing: VideoAgent.playing?(video)})
    end

    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end
end
