defmodule GrasstubeWeb.PlaylistChannel do
  use Phoenix.Channel
  require Logger

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.PlaylistAgent
  alias GrasstubeWeb.ChatAgent
  alias GrasstubeWeb.VideoAgent
  
  def join("playlist:" <> room_name, _message, socket) do
    case Grasstube.ProcessRegistry.lookup(room_name, :playlist) do
      :not_found ->
        {:error, "no room"}
      
      _channel ->
        send(self(), {:after_join, nil})
    end
    {:ok, socket}
  end

  def handle_info({:after_join, _}, socket) do
    "playlist:" <> room_name = socket.topic
    playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)
    video = Grasstube.ProcessRegistry.lookup(room_name, :video)

    push(socket, "playlist", %{playlist: PlaylistAgent.get_playlist(playlist)})
    current = VideoAgent.get_current_video(video)

    if current != :nothing do
      push(socket, "current", %{id: current.id})
    end

    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end
  
  def handle_info({_ref, _}, socket) do
    {:noreply, socket}
  end
  
  def handle_in("q_add", %{"url" => user_url, "sub" => sub, "small" => small}, socket) do
    "playlist:" <> room_name = socket.topic

    if ChatAgent.mod?(room_name, socket.id) do
      playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      Task.Supervisor.async_nolink(Tasks, fn -> PlaylistAgent.q_add(playlist, user_url, sub, small) end)
    end

    {:noreply, socket}
  end

  def handle_in("q_add", %{"url" => user_url, "sub" => sub}, socket) do
    "playlist:" <> room_name = socket.topic

    if ChatAgent.mod?(room_name, socket.id) do
      playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      Task.Supervisor.async_nolink(Tasks, fn -> PlaylistAgent.q_add(playlist, user_url, sub, "") end)
    end

    {:noreply, socket}
  end

  def handle_in("q_del", %{"id" => id}, socket) do
    "playlist:" <> room_name = socket.topic

    if ChatAgent.mod?(room_name, socket.id) do
      playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      PlaylistAgent.remove_queue(playlist, id)
    end

    {:noreply, socket}
  end

  def handle_in("q_set", %{"id" => id}, socket) do
    "playlist:" <> room_name = socket.topic

    if ChatAgent.mod?(room_name, socket.id) do
      playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      video = Grasstube.ProcessRegistry.lookup(room_name, :video)

      case PlaylistAgent.get_video(playlist, id) do
        :not_found ->
          nil

        vid ->
          VideoAgent.set_current_video(video, vid)
          Endpoint.broadcast("playlist:" <> room_name, "current", %{id: vid.id})

          Endpoint.broadcast("video:" <> room_name, "setvid", %{
			      id: vid.id,
            type: vid.type,
            url: vid.url,
            sub: vid.sub,
            small: vid.small
          })

          Endpoint.broadcast("video:" <> room_name, "playing", %{playing: false})
      end
    end

    {:noreply, socket}
  end

  def handle_in("q_next", _, socket) do
    "playlist:" <> room_name = socket.topic

    if ChatAgent.mod?(room_name, socket.id) do
      playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      PlaylistAgent.next_video(playlist)
    end

    {:noreply, socket}
  end

  def handle_in("toggle_playing", _, socket) do
    "playlist:" <> room_name = socket.topic

    if ChatAgent.mod?(room_name, socket.id) do
      video = Grasstube.ProcessRegistry.lookup(room_name, :video)
      VideoAgent.toggle_playing(video)
    end

    {:noreply, socket}
  end

  def handle_in("seek", %{"t" => t}, socket) do
    "playlist:" <> room_name = socket.topic

    if ChatAgent.mod?(room_name, socket.id) do
      video = Grasstube.ProcessRegistry.lookup(room_name, :video)
      VideoAgent.set_seek(video, t)
      Endpoint.broadcast("video:" <> room_name, "seek", %{t: t})
    end
    
    {:noreply, socket}
  end

end