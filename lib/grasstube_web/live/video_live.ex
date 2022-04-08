defmodule GrasstubeWeb.VideoLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{ChatAgent, PlaylistAgent, ProcessRegistry, VideoAgent}

  def render(assigns) do
    GrasstubeWeb.PageView.render("video_live.html", assigns)
  end

  def mount(_params, %{"room" => room} = session, socket) do
    topic = "video:#{room}"
    if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(topic)

    user = Grasstube.Guardian.user(session)

    socket_id = GrasstubeWeb.UserSocket.new_id()

    if user do
      GrasstubeWeb.Endpoint.subscribe("user:#{room}:#{user.username}")
    end

    user_id =
      if is_nil(user) do
        "$" <> socket_id
      else
        user.username
      end

    socket =
      socket
      |> assign(room: room)
      |> assign(topic: topic)
      |> assign(chat: ProcessRegistry.lookup(room, :chat))
      |> assign(video: ProcessRegistry.lookup(room, :video))
      |> assign(user_id: user_id)
      |> assign(user: user)
      |> assign(id: socket_id)

    socket =
      socket
      |> assign(controls: ChatAgent.controls?(socket.assigns.chat, socket))

    socket.assigns.video
    |> VideoAgent.get_status()
    |> case do
      {:nothing, _, _} ->
        nil

      {video, time, playing} ->
        send(self(), %{
          event: "setvid",
          payload: %{
            id: video.id,
            type: video.type,
            url: video.url,
            sub: video.sub,
            alts: video.alts,
            duration: video.duration
          }
        })

        send(self(), %{event: "seek", payload: %{t: time}})
        send(self(), %{event: "playing", payload: %{playing: playing}})
    end

    {:ok, socket}
  end

  def handle_event("play", %{"offset" => offset}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      socket.assigns.video
      |> VideoAgent.seek_shift(offset)
      |> VideoAgent.set_playing(true)
    end

    {:noreply, socket}
  end

  def handle_event("play", _, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      socket.assigns.video
      |> VideoAgent.set_playing(true)
    end

    {:noreply, socket}
  end

  def handle_event("pause", _, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      socket.assigns.video
      |> VideoAgent.set_playing(false)
    end

    {:noreply, socket}
  end

  def handle_event("seek", %{"time" => time}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      socket.assigns.video
      |> VideoAgent.set_seek(time)
    end

    {:noreply, socket}
  end

  def handle_event("next", _, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      socket.assigns.room
      |> ProcessRegistry.lookup(:playlist)
      |> PlaylistAgent.next_video()
    end

    {:noreply, socket}
  end

  def handle_event("ping", _, socket) do
    {:reply, %{}, socket}
  end

  def handle_info(%{event: "setvid", payload: payload}, socket) do
    {:noreply, push_event(socket, "setvid", payload)}
  end

  def handle_info(%{event: "controls"}, socket) do
    {:noreply,
     push_event(socket, "controls", %{
       controls: ChatAgent.controls?(socket.assigns.chat, socket)
     })}
  end

  def handle_info(%{event: "playing", payload: payload}, socket) do
    {:noreply, push_event(socket, "playing", payload)}
  end

  def handle_info(%{event: "time", payload: payload}, socket) do
    {:noreply, push_event(socket, "time", payload)}
  end

  def handle_info(%{event: "seek", payload: payload}, socket) do
    {:noreply, push_event(socket, "seek", payload)}
  end
end
