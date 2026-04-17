defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view
  use GrasstubeWeb.ChatComponent
  use GrasstubeWeb.PollComponent

  import Ecto.Query, only: [from: 2]

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{
    ChatAgent,
    Room,
    Repo,
    ProcessRegistry,
    PlaylistAgent,
    VideoAgent,
    Presence,
    Poll
  }

  def render(assigns) do
    ~H"""
    <div class="main">
      <div id="video" class="player" phx-hook="video" phx-update="ignore"></div>
      <.live_component
        module={GrasstubeWeb.ChatComponent}
        id={to_string(@room.id)}
        current_scope={@current_scope}
        pid={@chat_pid}
        state={@chat}
      />
      <div class="left">
        <div class="presence">
          <div :for={{_id, %{metas: metas}} <- @presence}>
            <span :for={meta <- metas}>
              {cc_emoji(meta.country_code)}
              <%= if meta.user do %>
                {meta.user.username}
              <% else %>
                guest:{meta.guest}
              <% end %>
            </span>
          </div>
        </div>
      </div>
      <div class="right"></div>

      <div
        id="playlist_form"
        phx-update="ignore"
        phx-hook="media_directories"
        directories={(@room.media_directories || []) |> Jason.encode!()}
      >
        <div>
          <div class="top">
            <button class="close"></button>
            <form class="playlist-form" phx-submit="playlist_add">
              <input name="video_url" value="" placeholder="Video url" autocomplete="off" />
              <input name="subtitles_url" value="" placeholder="Subtitles url" autocomplete="off" />
              <input type="submit" value="Add" />
            </form>
          </div>
          <div class="list"></div>
        </div>
      </div>
    </div>

    <div class="interactions" id="interactions" phx-update="ignore">
      <label class="btn-chk" for="chk_show_playlist_form">
        <input type="checkbox" id="chk_show_playlist_form" />
        <span>Add to playlist</span>
      </label>
      <label class="btn-chk" for="chk_show_polls">
        <input type="checkbox" id="chk_show_polls" />
        <span>Polls</span>
      </label>
      <label class="btn-chk" for="chk_create_poll">
        <input type="checkbox" id="chk_create_poll" />
        <span>Create poll</span>
      </label>

      <div id="polls-form" phx-update="ignore" phx-hook="poll_form">
        <div>
          <form id="polls_form" phx-submit="poll_create">
            <input name="name" placeholder="Name" autocomplete="off" />
            <input name="0" value="" placeholder="Option" autocomplete="off" />
            <input name="1" value="" placeholder="Option" autocomplete="off" />
          </form>
          <button class="btn-add-option">Add option</button>
          <input type="submit" value="Create" form="polls_form" />
        </div>
      </div>
    </div>

    <div class="bottom">
      <div class="polls">
        <%= if length(@polls) == 0 do %>
          No polls
        <% end %>
        <%= for p <- @polls do %>
          <.live_component
            module={GrasstubeWeb.PollComponent}
            id={to_string(p.id)}
            current_scope={@current_scope}
            poll={p}
          />
        <% end %>
      </div>
      <div class="playlist">
        <% playlist_top =
          @playlist
          |> Enum.drop_while(&(&1.id != (@current_video != nil and @current_video.id)))

        playlist_rest =
          @playlist
          |> Enum.take_while(&(&1.id != (@current_video != nil and @current_video.id))) %>
        <table class={if @current_video, do: "visible"}>
          <tr :for={{v, i} <- Enum.with_index(playlist_top)} class={if i == 0, do: "current"}>
            <td>
              <button
                phx-click="playlist_set"
                phx-value-id={v.id}
                disabled={@current_video != nil and @current_video.id == v.id}
                class="set"
              >
              </button>
            </td>
            <td class="title">{v.title}</td>
            <td>{to_hhmmss(v.duration)}</td>
            <td class="inserted_at">{v.inserted_at}</td>
            <td><button phx-click="playlist_remove" phx-value-id={v.id} class="close"></button></td>
          </tr>
        </table>
        <table class={if length(playlist_rest) > 0, do: "visible"}>
          <tr :for={v <- playlist_rest}>
            <td>
              <button
                phx-click="playlist_set"
                phx-value-id={v.id}
                disabled={@current_video != nil and @current_video.id == v.id}
                class="set"
              >
              </button>
            </td>
            <td class="title">{v.title}</td>
            <td>{to_hhmmss(v.duration)}</td>
            <td class="inserted_at">{v.inserted_at}</td>
            <td><button phx-click="playlist_remove" phx-value-id={v.id} class="close"></button></td>
          </tr>
        </table>
      </div>
    </div>
    """
  end

  def mount(%{"title" => room_name}, _session, socket) do
    room = Repo.get_by(Room, title: room_name)

    chat_pid = ProcessRegistry.lookup(room.id, ChatAgent)
    chat = ChatAgent.get(chat_pid)

    playlist_pid = ProcessRegistry.lookup(room.id, PlaylistAgent)

    playlist =
      PlaylistAgent.get(playlist_pid).videos
      |> Enum.sort_by(& &1.inserted_at)

    video_pid = ProcessRegistry.lookup(room.id, VideoAgent)
    video = VideoAgent.get(video_pid)

    polls =
      from(p in Poll, where: p.room_id == ^room.id)
      |> Repo.all()
      |> Repo.preload(:votes)
      |> Enum.sort_by(& &1.inserted_at, :desc)

    if connected?(socket) do
      Endpoint.subscribe("video:#{room.id}")
      Endpoint.subscribe("playlist:#{room.id}")
      Endpoint.subscribe("polls:#{room.id}")

      if video.current_video do
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
      |> assign(polls: polls)
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

  def update_polls(room_id) do
    polls =
      from(p in Poll, where: p.room_id == ^room_id)
      |> Repo.all()
      |> Repo.preload(:votes)
      |> Enum.sort_by(& &1.inserted_at, :desc)

    Endpoint.broadcast("polls:#{room_id}", "polls", polls)
  end

  def handle_info(%{topic: "playlist:" <> _, payload: playlist}, socket) do
    playlist =
      playlist
      |> Enum.sort_by(& &1.inserted_at)

    {:noreply, assign(socket, playlist: playlist)}
  end

  def handle_info(%{topic: "video:" <> _, event: "set", payload: video}, socket) do
    video_info =
      case video do
        nil ->
          %{type: "default", video_url: nil, subtitles_url: nil}

        _ ->
          %{
            type: video.type,
            video_url: video.video_url,
            subtitles_url: video.subtitles_url
          }
      end

    socket =
      socket
      |> assign(current_video: video)
      |> push_event("video_set", video_info)

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

  def handle_info(%{topic: "polls:" <> _, payload: polls}, socket) do
    {:noreply, assign(socket, polls: polls)}
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

  def handle_event("video_next", _params, socket) do
    VideoAgent.next_video(socket.assigns.video_pid)
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

  def handle_event("poll_create", %{"name" => name} = params, socket) do
    params
    |> Enum.reject(&(elem(&1, 0) == "name"))
    |> Enum.filter(&(String.length(elem(&1, 1)) > 0))
    |> Enum.map(&elem(&1, 1))
    |> case do
      [] ->
        nil

      options ->
        %Poll{name: name, options: options, room_id: socket.assigns.room.id}
        |> Repo.insert()

        update_polls(socket.assigns.room.id)
    end

    {:noreply, socket}
  end
end
