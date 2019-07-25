defmodule GrasstubeWeb.PlaylistChannel do
  use Phoenix.Channel
  require Logger

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.PlaylistAgent
  alias GrasstubeWeb.ChatAgent
  alias GrasstubeWeb.VideoAgent
  
  def join("playlist:0", _message, socket) do
    send(self(), {:after_join, nil})
    {:ok, socket}
  end

  def handle_info({:after_join, _}, socket) do
    push(socket, "playlist", %{playlist: PlaylistAgent.get_playlist()})
    current = VideoAgent.get_current_video()
    if current != :nothing do
      push(socket, "current", %{id: current.id})
    end

    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end
  
  def leave(user_id) do
    case ChatAgent.get_user(user_id) do
      :not_found ->
        nil

      _ ->
        Logger.info(user_id <> " left")
        #PollsAgent.remove_vote(Polls, user_id)
        #Endpoint.broadcast("room:0", "polls", PollsAgent.get_polls(Polls))
    end
  end
  
  def handle_in("q_add", %{"url" => user_url, "sub" => sub, "small" => small}, socket) do
    if ChatAgent.mod?(socket.id) do
      Task.Supervisor.async_nolink(Tasks, fn -> PlaylistAgent.q_add(user_url, sub, small) end)
    end

    {:noreply, socket}
  end

  def handle_in("q_add", %{"url" => user_url, "sub" => sub}, socket) do
    if ChatAgent.mod?(socket.id) do
      Task.Supervisor.async_nolink(Tasks, fn -> PlaylistAgent.q_add(user_url, sub, "") end)
    end

    {:noreply, socket}
  end

  def handle_in("q_del", %{"id" => id}, socket) do
    if ChatAgent.mod?(socket.id) do
      PlaylistAgent.remove_queue(id)
    end

    {:noreply, socket}
  end

  def handle_in("q_set", %{"id" => id}, socket) do
    if ChatAgent.mod?(socket.id) do
      case PlaylistAgent.get_video(id) do
        :not_found ->
          nil

        vid ->
          VideoAgent.set_current_video(vid)
          Endpoint.broadcast("playlist:0", "current", %{id: vid.id})

          Endpoint.broadcast("video:0", "setvid", %{
			id: vid.id,
            type: vid.type,
            url: vid.url,
            sub: vid.sub,
            small: vid.small
          })

          Endpoint.broadcast("video:0", "playing", %{playing: false})
      end
    end

    {:noreply, socket}
  end

  def handle_in("q_next", _, socket) do
    if ChatAgent.mod?(socket.id) do
      PlaylistAgent.next_video()
    end

    {:noreply, socket}
  end

  def handle_in("toggle_playing", _, socket) do
    if ChatAgent.mod?(socket.id) do
      VideoAgent.toggle_playing()
    end

    {:noreply, socket}
  end

  def handle_in("seek", %{"t" => t}, socket) do
    if ChatAgent.mod?(socket.id) do
      VideoAgent.set_seek(t)
      Endpoint.broadcast("video:0", "seek", %{t: t})
    end
    
    {:noreply, socket}
  end

end