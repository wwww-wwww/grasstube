defmodule GrasstubeWeb.VideoChannel do
  use Phoenix.Channel

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.VideoAgent
  alias GrasstubeWeb.ChatAgent
  alias GrasstubeWeb.PlaylistAgent

  def join("video:" <> room_name, %{"password" => password}, socket) do
    case Grasstube.ProcessRegistry.lookup(room_name, :video) do
      :not_found ->
        {:error, "no room"}

      _ ->
        case ChatAgent.auth(socket, room_name, password) do
          {:ok, socket} ->
            if not String.starts_with?(socket.assigns.user_id, "$") do
              :ok = GrasstubeWeb.Endpoint.subscribe("user:#{room_name}:#{socket.assigns.user_id}")
            end

            send(self(), {:after_join, nil})
            {:ok, socket}

          resp ->
            resp
        end
    end
  end

  def handle_info({:after_join, _}, socket) do
    "video:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      push(socket, "controls", %{})
    end

    video = Grasstube.ProcessRegistry.lookup(room_name, :video)

    current = VideoAgent.get_current_video(video)

    if current != :nothing do
      push(socket, "setvid", %{
        id: current.id,
        type: current.type,
        url: current.url,
        sub: current.sub,
        alts: current.alts,
        duration: current.duration
      })

      current_time = VideoAgent.get_time(video)
      push(socket, "seek", %{t: current_time})

      push(socket, "playing", %{playing: VideoAgent.playing?(video)})
    end

    {:noreply, socket}
  end

  def handle_info(
        %Phoenix.Socket.Broadcast{topic: "user:" <> _, event: ev, payload: payload},
        socket
      ) do
    push(socket, ev, payload)
    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end

  def handle_in("play", _, socket) do
    "video:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      video = Grasstube.ProcessRegistry.lookup(room_name, :video)
      VideoAgent.set_playing(video, true)
    end

    {:noreply, socket}
  end

  def handle_in("pause", _, socket) do
    "video:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      video = Grasstube.ProcessRegistry.lookup(room_name, :video)
      VideoAgent.set_playing(video, false)
    end

    {:noreply, socket}
  end

  def handle_in("seek", %{"t" => t}, socket) do
    "video:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      video = Grasstube.ProcessRegistry.lookup(room_name, :video)
      VideoAgent.set_seek(video, t)
      Endpoint.broadcast("video:" <> room_name, "seek", %{t: t})
    end

    {:noreply, socket}
  end

  def handle_in("next", _, socket) do
    "video:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      playlist = Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      PlaylistAgent.next_video(playlist)
    end

    {:noreply, socket}
  end
end
