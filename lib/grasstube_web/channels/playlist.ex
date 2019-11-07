defmodule GrasstubeWeb.PlaylistChannel do
  use Phoenix.Channel

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.PlaylistAgent
  alias GrasstubeWeb.ChatAgent
  alias GrasstubeWeb.VideoAgent
  
  def join("playlist:" <> room_name, %{"password" => password}, socket) do
    case Grasstube.ProcessRegistry.lookup(room_name, :playlist) do
      :not_found ->
        {:error, "no room"}
      
      _ ->
        case ChatAgent.auth(socket, room_name, password) do
          {:ok, socket} ->
            send(self(), {:after_join, nil})
            {:ok, socket}
          resp ->
            resp
        end
    end
  end

  def handle_info({:after_join, _}, socket) do
    "playlist:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      push(socket, "controls", %{})
    end

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
  
  def handle_in("q_add", %{"title" => title, "url" => user_url, "sub" => sub, "small" => small}, socket) do
    "playlist:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.add_queue(title, user_url, sub, small)
    end

    {:noreply, socket}
  end

  def handle_in("q_del", %{"id" => id}, socket) do
    "playlist:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.remove_queue(id)
    end

    {:noreply, socket}
  end

  def handle_in("q_order", %{"order" => order}, socket) do
    "playlist:" <> room_name = socket.topic
    
    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.set_queue(order)
    end

    {:noreply, socket}
  end

  def handle_in("q_set", %{"id" => id}, socket) do
    "playlist:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)

      case PlaylistAgent.get_video(playlist, id) do
        :not_found ->
          nil

        vid ->
          Grasstube.ProcessRegistry.lookup(room_name, :video)
          |> VideoAgent.set_current_video(vid)
          
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

end