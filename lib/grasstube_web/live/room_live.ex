defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view
  use GrasstubeWeb.ChatComponent

  alias GrasstubeWeb.Endpoint
  alias Grasstube.{ChatAgent, Room, Repo, ProcessRegistry, PlaylistAgent, VideoAgent, Presence}

  def render(assigns) do
    ~H"""
    <div class="main">
      <div id="video" class="player" phx-hook="video" phx-update="ignore">
      </div>
      <.live_component
        module={GrasstubeWeb.ChatComponent}
        id={GrasstubeWeb.ChatComponent.id(@room.id)}
        current_scope={@current_scope}
        pid={@chat_pid}
        state={@chat}
      />
      <div class="left">
        <div class="presence">
          <%= for {_id, %{metas: metas}} <- @presence do %>
            <div>
              <%= for meta <- metas do %>
              <span>
                <%= if meta.user != nil do %>
                  {meta.user.username} {meta.country_code}
                <% else %>
                  guest:{meta.guest} {meta.country_code}
                <% end %>
              </span>
              <% end %>
            </div>
          <% end %>
        </div>
        <div class="polls">
        </div>
      </div>
      <div class="right">
      </div>
    </div>

    <div class="bottom">
      <div class="interaction-area">
        <div class="interactions">
          <div>
            <button>Reset height</button>
          </div>
          <div>
            <button>Add to playlist</button>
          </div>
        </div>
        <div class="playlist">
          <%= for v <- @playlist do %>
            <div class={if @current_video != nil and @current_video.id == v.id, do: "current"}>
              <span>{v.title}</span>
              <button phx-click="playlist_remove" phx-value-id={v.id}>delete</button>
              <button phx-click="playlist_set" phx-value-id={v.id} disabled={@current_video != nil and @current_video.id == v.id}>set</button>
            </div>
          <% end %>
        </div>
      </div>
    </div>
          <form class="playlist-form" phx-submit="playlist_add">
            <input name="video_url" value="https://bc.grass.moe/public/video/assaultlily05.mp4" autocomplete="off"/>
            <input name="subtitles_url" value="https://bc.grass.moe/public/video/assaultlily05.ass" autocomplete="off"/>
            <input type="submit" value="add"/>
          </form>
    """
  end

  def mount(%{"name" => room_name}, _session, socket) do
    room = Repo.get_by(Room, title: room_name)

    chat_pid = ProcessRegistry.lookup(room.id, ChatAgent)
    chat = ChatAgent.get(chat_pid)

    playlist_pid = ProcessRegistry.lookup(room.id, PlaylistAgent)
    playlist = PlaylistAgent.get(playlist_pid).videos

    video_pid = ProcessRegistry.lookup(room.id, VideoAgent)
    video = VideoAgent.get(video_pid)

    if connected?(socket) do
      Endpoint.subscribe("video:#{room.id}")
      Endpoint.subscribe("playlist:#{room.id}")

      if video.current_video != nil do
        send(self(), %{topic: "video:", event: "set", payload: video.current_video})

        send(self(), %{
          topic: "video:",
          event: "sync",
          payload: %{playing: video.playing, time: VideoAgent.get_time(video)}
        })
      end

      Presence.track(
        self(),
        "room:#{room.id}",
        socket.assigns.current_scope.id,
        socket.assigns.current_scope
      )

      GrasstubeWeb.IndexLive.update()

      Endpoint.broadcast("presence:#{room.id}", "update", Presence.list("room:#{room.id}"))
      Endpoint.subscribe("presence:#{room.id}")
    end

    socket =
      socket
      |> assign(room: room)
      |> assign(chat_pid: chat_pid)
      |> assign(chat: chat)
      |> assign(playlist_pid: playlist_pid)
      |> assign(playlist: playlist)
      |> assign(video_pid: video_pid)
      |> assign(current_video: video.current_video)
      |> assign(presence: Presence.list("room:#{room.id}"))

    {:ok, socket}
  end

  def terminate(_reason, socket) do
    room_id = socket.assigns.room.id
    Presence.untrack(self(), "room:#{room_id}", socket.assigns.current_scope.id)
    Endpoint.broadcast("presence:#{room_id}", "update", Presence.list("room:#{room_id}"))
    GrasstubeWeb.IndexLive.update()

    :ok
  end

  def handle_info(%{topic: "playlist:" <> _, payload: playlist}, socket) do
    IO.inspect("playlist")
    socket = assign(socket, playlist: playlist)
    {:noreply, socket}
  end

  def handle_info(%{topic: "video:" <> _, event: "set", payload: video}, socket) do
    socket =
      socket
      |> assign(current_video: video)
      |> push_event("video_set", %{
        type: video.type,
        video_url: video.video_url,
        subtitles_url: video.subtitles_url
      })

    {:noreply, socket}
  end

  def handle_info(%{topic: "video:" <> _, event: "playing", payload: playing}, socket) do
    {:noreply, push_event(socket, "video_playing", %{playing: playing})}
  end

  def handle_info(%{topic: "video:" <> _, event: "time", payload: time}, socket) do
    {:noreply, push_event(socket, "video_time", %{time: time})}
  end

  def handle_info(%{topic: "video:" <> _, event: "sync", payload: data}, socket) do
    {:noreply, push_event(socket, "video_sync", data)}
  end

  def handle_info(%{topic: "presence:" <> _, payload: presence}, socket) do
    {:noreply, assign(socket, presence: presence)}
  end

  def handle_event(
        "playlist_add",
        %{"video_url" => video_url, "subtitles_url" => subtitles_url},
        socket
      ) do
    PlaylistAgent.add_to_queue(socket.assigns.playlist_pid, video_url, subtitles_url, [])
    {:noreply, socket}
  end

  def handle_event("playlist_remove", %{"id" => id}, socket) do
    PlaylistAgent.remove_from_queue(socket.assigns.playlist_pid, id)
    {:noreply, socket}
  end

  def handle_event("playlist_set", %{"id" => id}, socket) do
    VideoAgent.set_video(socket.assigns.video_pid, id)
    {:noreply, socket}
  end

  def handle_event("video_playing", %{"playing" => playing, "offset" => offset}, socket) do
    if playing do
      VideoAgent.set_dtime(socket.assigns.video_pid, offset)
    end

    VideoAgent.set_playing(socket.assigns.video_pid, playing)

    {:noreply, socket}
  end

  def handle_event("video_seek", %{"time" => time}, socket) do
    VideoAgent.set_time(socket.assigns.video_pid, time)
    {:noreply, socket}
  end

  def handle_event("ping", _, socket) do
    {:reply, %{}, socket}
  end
end
