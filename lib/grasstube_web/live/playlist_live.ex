defmodule GrasstubeWeb.PlaylistLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{ChatAgent, PlaylistAgent, Presence, ProcessRegistry, VideoAgent}

  def render(assigns) do
    GrasstubeWeb.PageView.render("playlist_live.html", assigns)
  end

  def mount(params, %{"room" => room} = session, socket) do
    topic = "playlist:#{room}"
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
      |> assign(playlist: ProcessRegistry.lookup(room, :playlist))
      |> assign(user_id: user_id)
      |> assign(user: user)
      |> assign(id: socket_id)

    current_video =
      socket.assigns.video
      |> VideoAgent.get_current_video()
      |> case do
        :nothing -> nil
        current -> current.id
      end

    playlist = PlaylistAgent.get_playlist(socket.assigns.playlist)

    duration =
      playlist
      |> Enum.filter(&(&1.duration != :unset))
      |> Enum.reduce(0, &(&2 + &1.duration))

    current_index =
      Enum.with_index(playlist, 1)
      |> Enum.filter(&(elem(&1, 0).id == current_video))
      |> Enum.map(&elem(&1, 1))
      |> Enum.at(0)
      |> Kernel.||(0)

    socket =
      socket
      |> assign(playlist_items: playlist)
      |> assign(duration: duration)
      |> assign(current: current_video)
      |> assign(current_index: current_index)
      |> assign(controls: ChatAgent.controls?(socket.assigns.chat, socket))

    {:ok, socket}
  end

  def handle_event(
        "add",
        %{"title" => title, "url" => user_url, "sub" => sub, "alts" => alts},
        socket
      ) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      alts =
        case Jason.decode(alts) do
          {:ok, alts} -> alts
          {:error, _} -> %{}
        end

      socket.assigns.playlist
      |> PlaylistAgent.add_queue(title, user_url, sub, alts)
    end

    {:noreply, socket}
  end

  def handle_event("order", %{"order" => order}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      socket.assigns.playlist
      |> PlaylistAgent.set_queue(order)
    end

    {:noreply, socket}
  end

  def handle_event("set", %{"value" => id}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      case PlaylistAgent.get_video(socket.assigns.playlist, id) do
        :not_found -> nil
        vid -> VideoAgent.set_current_video(socket.assigns.video, vid)
      end
    end

    {:noreply, socket}
  end

  def handle_event("remove", %{"value" => id}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      PlaylistAgent.remove_queue(socket.assigns.playlist, id)
    end

    {:noreply, socket}
  end

  def handle_info(%{event: "current", payload: %{id: id}}, socket) do
    current_index =
      Enum.with_index(socket.assigns.playlist_items, 1)
      |> Enum.filter(&(elem(&1, 0).id == id))
      |> Enum.map(&elem(&1, 1))
      |> Enum.at(0)
      |> Kernel.||(0)

    socket =
      socket
      |> assign(current: id)
      |> assign(current_index: current_index)

    {:noreply, socket}
  end

  def handle_info(%{event: "playlist", payload: %{playlist: playlist}}, socket) do
    duration =
      playlist
      |> Enum.filter(&(&1.duration != :unset))
      |> Enum.reduce(0, &(&2 + &1.duration))

    current_index =
      Enum.with_index(playlist, 1)
      |> Enum.filter(&(elem(&1, 0).id == socket.assigns.current))
      |> Enum.map(&elem(&1, 1))
      |> Enum.at(0)
      |> Kernel.||(0)

    socket =
      socket
      |> assign(playlist_items: playlist)
      |> assign(duration: duration)
      |> assign(current_index: current_index)

    {:noreply, socket}
  end

  def handle_info(%{event: "controls"}, socket) do
    {:noreply, assign(socket, controls: ChatAgent.controls?(socket.assigns.chat, socket))}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end

  def handle_info({_ref, _}, socket) do
    {:noreply, socket}
  end
end
