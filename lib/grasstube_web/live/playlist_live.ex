defmodule GrasstubeWeb.PlaylistLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{ChatAgent, PlaylistAgent, ProcessRegistry, VideoAgent}

  def render(assigns) do
    GrasstubeWeb.PageView.render("playlist_live.html", assigns)
  end

  def mount(_params, %{"room" => room, "current_user" => current_user, "chat" => chat}, socket) do
    topic = "playlist:#{room}"

    if connected?(socket) do
      GrasstubeWeb.Endpoint.subscribe(topic)

      case current_user do
        %{username: username} ->
          GrasstubeWeb.Endpoint.subscribe("user:#{room}:#{username}")

        _ ->
          nil
      end
    end

    video = ProcessRegistry.lookup(room, :video)
    playlist = ProcessRegistry.lookup(room, :playlist)
    playlist_items = PlaylistAgent.get_playlist(playlist)

    current_video =
      video
      |> VideoAgent.get_current_video()
      |> case do
        :nothing -> nil
        current -> current.id
      end

    duration =
      playlist_items
      |> Enum.map(& &1.duration)
      |> Enum.filter(&is_number(&1))
      |> Enum.sum()

    current_index =
      Enum.with_index(playlist_items, 1)
      |> Enum.filter(&(elem(&1, 0).id == current_video))
      |> Enum.map(&elem(&1, 1))
      |> Enum.at(0)
      |> Kernel.||(0)

    socket =
      socket
      |> assign(user: current_user)
      |> assign(chat: chat)
      |> assign(video: video)
      |> assign(playlist: playlist)
      |> assign(controls: ChatAgent.controls?(chat, current_user))
      |> assign(playlist_items: playlist_items)
      |> assign(duration: duration)
      |> assign(current: current_video)
      |> assign(current_index: current_index)
      |> assign(repeat_mode: PlaylistAgent.get_repeat_mode(playlist))
      |> assign(script: ChatAgent.get_script(chat, :playlist))

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

  def handle_event("yt_search", %{"query" => query}, socket) do
    {:reply, GrasstubeWeb.YTController.search(query), socket}
  end

  def handle_event("cycle_playlist_mode", %{"mode" => mode}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      new_mode =
        case mode do
          "none" -> :playlist
          "playlist" -> :track
          "track" -> :none
        end

      PlaylistAgent.set_repeat_mode(socket.assigns.playlist, new_mode)
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

  def handle_info(%{event: "repeat", payload: %{repeat: repeat_mode}}, socket) do
    {:noreply, assign(socket, repeat_mode: repeat_mode)}
  end

  def handle_info(%{event: "controls"}, socket) do
    {:noreply, assign(socket, controls: ChatAgent.controls?(socket.assigns.chat, socket))}
  end

  def handle_info(%{event: "revoke_controls"}, socket) do
    {:noreply, assign(socket, controls: ChatAgent.controls?(socket.assigns.chat, socket))}
  end

  def handle_info(%{event: "presence"}, socket) do
    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end

  def handle_info({_ref, _}, socket) do
    {:noreply, socket}
  end
end
