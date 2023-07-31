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

            _ ->
              current_user
          end

        Presence.track(self(), topic, user_id, %{buffered: 0})
        user_id
      else
        nil
      end

    GrasstubeWeb.Endpoint.subscribe("user_video:#{room}:#{user_id}")

    video = ProcessRegistry.lookup(room, :video)

    socket =
      socket
      |> assign(room: room)
      |> assign(topic: topic)
      |> assign(user: current_user)
      |> assign(user_id: user_id)
      |> assign(chat: chat)
      |> assign(video: video)
      |> assign(controls: ChatAgent.controls?(chat, current_user))
      |> assign(users: Presence.list(topic))
      |> assign(autopause: Grasstube.Room.get_attr(chat, :autopause))

    if connected?(socket) do
      case VideoAgent.get_status(socket.assigns.video) do
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
    untrack(self(), socket.assigns.room, socket.assigns.topic, socket.assigns.user_id)
    :ok
  end

  def update_autoplay_min(room) do
    video = ProcessRegistry.lookup(room, :video)
    topic = "video:#{room}"

    time =
      Presence.list(topic)
      |> Enum.map(&elem(&1, 1))
      |> Enum.map(& &1.metas)
      |> List.flatten()
      |> Enum.map(& &1.buffered)
      |> case do
        [] -> 0
        times -> Enum.min(times)
      end

    VideoAgent.set_autopause_time(video, time)
  end

  def untrack(room, name) do
    user_id =
      Presence.list("video:#{room}")
      |> Enum.filter(fn {username, _} ->
        case username do
          ^name ->
            true

          "$" <> n ->
            case name do
              "anon" <> n2 -> n == n2
              _ -> false
            end

          _ ->
            false
        end
      end)
      |> case do
        [_user1, _] -> nil
        [{user_id, _}] -> user_id
        _ -> nil
      end

    if !is_nil(user_id) do
      GrasstubeWeb.Endpoint.broadcast("user_video:#{room}:#{user_id}", "untrack", nil)
    end
  end

  defp untrack(pid, room, topic, user_id) do
    Presence.untrack(pid, topic, user_id)

    if VideoAgent.can_autopause?(ProcessRegistry.lookup(room, :video)) do
      update_autoplay_min(room)
    end
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

  def handle_event("buffered", %{"buffered" => buffered}, socket) do
    if VideoAgent.can_autopause?(socket.assigns.video) do
      Presence.update(self(), socket.assigns.topic, socket.assigns.user_id, %{
        buffered: buffered
      })

      update_autoplay_min(socket.assigns.room)
    end

    {:noreply, socket}
  end

  def handle_event("getvid", _, socket) do
    case VideoAgent.get_status(socket.assigns.video) do
      %{video: :nothing} ->
        {:reply, %{}, socket}

      %{video: video, time: time, playing: playing} ->
        {:reply,
         %{
           id: video.id,
           type: video.type,
           url: video.url,
           sub: video.sub,
           alts: video.alts,
           duration: video.duration,
           playing: playing,
           t: time
         }, socket}
    end
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

  def handle_info(%{event: "autopause", payload: autopause}, socket) do
    {:noreply,
     assign(socket, autopause: autopause)
     |> push_event("autopause", %{})}
  end

  def handle_info(%{event: "presence"}, socket) do
    {:noreply, socket}
  end

  def handle_info(%{event: "presence_diff"}, socket) do
    {:noreply, assign(socket, users: Presence.list(socket.assigns.topic))}
  end

  def handle_info(%{event: "untrack", topic: "user_video:" <> _}, socket) do
    untrack(self(), socket.assigns.room, socket.assigns.topic, socket.assigns.user_id)
    {:noreply, socket}
  end
end
