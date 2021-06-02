defmodule GrasstubeWeb.VideoChannel do
  use Phoenix.Channel

  alias GrasstubeWeb.{Endpoint, VideoAgent, ChatAgent, PlaylistAgent}

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

    Grasstube.ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      push(socket, "controls", %{})
    end

    Grasstube.ProcessRegistry.lookup(room_name, :video)
    |> VideoAgent.get_status()
    |> case do
      {:nothing, _, _} ->
        nil

      {video, time, playing} ->
        push(socket, "setvid", %{
          id: video.id,
          type: video.type,
          url: video.url,
          sub: video.sub,
          alts: video.alts,
          duration: video.duration
        })

        push(socket, "seek", %{t: time})
        push(socket, "playing", %{playing: playing})
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

    Grasstube.ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      Grasstube.ProcessRegistry.lookup(room_name, :video)
      |> VideoAgent.set_playing(true)
    end

    {:noreply, socket}
  end

  def handle_in("pause", _, socket) do
    "video:" <> room_name = socket.topic

    Grasstube.ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      Grasstube.ProcessRegistry.lookup(room_name, :video)
      |> VideoAgent.set_playing(false)
    end

    {:noreply, socket}
  end

  def handle_in("seek", %{"t" => t}, socket) do
    "video:" <> room_name = socket.topic

    Grasstube.ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      Grasstube.ProcessRegistry.lookup(room_name, :video)
      |> VideoAgent.set_seek(t)

      Endpoint.broadcast("video:" <> room_name, "seek", %{t: t})
    end

    {:noreply, socket}
  end

  def handle_in("next", _, socket) do
    "video:" <> room_name = socket.topic

    Grasstube.ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      Grasstube.ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.next_video()
    end

    {:noreply, socket}
  end
end
