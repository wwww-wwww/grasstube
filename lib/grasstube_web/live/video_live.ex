defmodule GrasstubeWeb.VideoLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{ChatAgent, PlaylistAgent, Presence, ProcessRegistry, VideoAgent}

  def render(assigns) do
    GrasstubeWeb.PageView.render("video_live.html", assigns)
  end

  def mount(_params, %{"room" => room, "current_user" => current_user, "chat" => chat}, socket) do
    topic = "video:#{room}"

    user_id =
      if connected?(socket) do
        GrasstubeWeb.Endpoint.subscribe(topic)

        user_id =
          case current_user do
            %Grasstube.User{username: username} ->
              GrasstubeWeb.Endpoint.subscribe("user:#{room}:#{username}")
              username

            "$" <> user_id ->
              current_user
          end

        Presence.track(self(), topic, user_id, %{})
        user_id
      else
        nil
      end

    socket =
      socket
      |> assign(room: room)
      |> assign(topic: topic)
      |> assign(user: current_user)
      |> assign(user_id: user_id)
      |> assign(chat: chat)
      |> assign(video: ProcessRegistry.lookup(room, :video))
      |> assign(controls: ChatAgent.controls?(chat, current_user))
      |> assign(users: Presence.list(topic))

    if connected?(socket) do
      socket.assigns.video
      |> VideoAgent.get_status()
      |> case do
        %{video: :nothing} ->
          nil

        %{video: video, time: time, playing: playing} ->
          send(self(), %{
            event: "setvid",
            payload: %{
              id: video.id,
              type: video.type,
              url: video.url,
              sub: video.sub,
              alts: video.alts,
              duration: video.duration,
              playing: playing,
              t: time
            }
          })
      end
    end

    {:ok, socket}
  end

  def terminate(_reason, socket) do
    Presence.untrack(self(), socket.assigns.topic, socket.assigns.user_id)
    :ok
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

  def handle_info(%{event: "revoke_controls"}, socket) do
    {:noreply,
     push_event(socket, "controls", %{
       controls: ChatAgent.controls?(socket.assigns.chat, socket)
     })}
  end

  def handle_info(%{event: "sync", payload: payload}, socket) do
    {:noreply, push_event(socket, "sync", payload)}
  end

  def handle_info(%{event: "seek", payload: payload}, socket) do
    {:noreply, push_event(socket, "seek", payload)}
  end

  def handle_event("buffered", %{"buffered" => buffered}, socket) do
    Grasstube.Presence.update(self(), socket.assigns.topic, socket.assigns.user_id, %{
      buffered: buffered
    })

    {:noreply, socket}
  end

  def handle_info(%{event: "presence"}, socket) do
    {:noreply, socket}
  end

  def handle_info(%{event: "presence_diff"}, socket) do
    {:noreply, socket |> assign(users: Presence.list(socket.assigns.topic))}
  end
end
