defmodule GrasstubeWeb.RoomLive do
  use GrasstubeWeb, :live_view
  use GrasstubeWeb.PollComponent

  import Ecto.Query, only: [from: 2]

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{
    ProcessRegistry,
    Presence,
    Repo,
    Room,
    Poll,
    Video,
    ChatAgent,
    PlaylistAgent,
    RoomAgent,
    VideoAgent,
    VideoScheduler
  }

  def render(assigns) do
    ~H"""
    <div class="main">
      <div id="video" class="player" phx-hook="video" phx-update="ignore" controls={@controls}></div>
      {live_render(@socket, GrasstubeWeb.ChatLive,
        id: GrasstubeWeb.ChatLive,
        session: %{"current_scope" => @current_scope, "room_id" => @room.id}
      )}
      <div class="left">
        <div>Autopause {if @autopause, do: "on", else: "off"}</div>
        <div class="presence">
          <div :for={{_id, %{metas: metas}} <- @presence}>
            <span :for={%{scope: scope, buffered: buffered} <- metas}>
              {cc_emoji(scope.country_code)}
              <%= if scope.user do %>
                {scope.user.username}
              <% else %>
                guest:{scope.guest}
              <% end %>
              {buffered}
            </span>
          </div>
        </div>
      </div>
      <div class="right"></div>

      <div
        :if={@controls}
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
      <label :if={@controls} class="btn-chk" for="chk_show_playlist_form">
        <input type="checkbox" id="chk_show_playlist_form" />
        <span>Add to playlist</span>
      </label>
      <label class="btn-chk" for="chk_show_polls">
        <input type="checkbox" id="chk_show_polls" />
        <span>Polls</span>
      </label>
      <label :if={@controls} class="btn-chk" for="chk_create_poll">
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
      <div class="playlist" id="playlist-container" phx-hook="playlist">
        <% playlist_top =
          @playlist
          |> Enum.drop_while(&(&1.id != (@current_video != nil and @current_video.id)))

        playlist_rest =
          @playlist
          |> Enum.take_while(&(&1.id != (@current_video != nil and @current_video.id))) %>
        <table class={if @current_video, do: "visible"}>
          <.playlist_row
            :for={{v, i} <- Enum.with_index(playlist_top)}
            video={v}
            controls={@controls}
            current={i == 0}
          />
        </table>
        <table class={if length(playlist_rest) > 0, do: "visible"}>
          <.playlist_row
            :for={v <- playlist_rest}
            video={v}
            controls={@controls}
            current={false}
          />
        </table>
      </div>
    </div>
    """
  end

  def mount(%{"title" => room_name}, _session, socket) do
    room = Repo.get_by(Room, title: room_name)
    room_pid = ProcessRegistry.lookup(room.id, RoomAgent)

    chat_pid = ProcessRegistry.lookup(room.id, ChatAgent)
    chat = ChatAgent.get(chat_pid)

    playlist_pid = ProcessRegistry.lookup(room.id, PlaylistAgent)

    playlist = PlaylistAgent.get(playlist_pid).videos

    video_pid = ProcessRegistry.lookup(room.id, VideoAgent)
    video = VideoAgent.get(video_pid)

    scheduler_pid = ProcessRegistry.lookup(room.id, VideoScheduler)

    polls =
      from(p in Poll, where: p.room_id == ^room.id)
      |> Repo.all()
      |> Repo.preload(:votes)
      |> Enum.sort_by(& &1.inserted_at, :desc)

    topic = "room:#{room.id}"

    if connected?(socket) do
      Endpoint.subscribe("video:#{room.id}")
      Endpoint.subscribe("playlist:#{room.id}")
      Endpoint.subscribe("polls:#{room.id}")

      if video.current_video do
        send(self(), %{topic: "video:", event: "set", payload: video.current_video})

        send(self(), %{
          topic: "video:",
          event: "sync",
          payload: %{
            playing: video.playing and not video.autopaused,
            time: VideoAgent.get_time(video)
          }
        })
      end

      Presence.track(
        self(),
        topic,
        socket.assigns.current_scope.id,
        %{scope: socket.assigns.current_scope, buffered: 0}
      )

      GrasstubeWeb.IndexLive.update()

      Endpoint.broadcast("presence:#{room.id}", "update", Presence.list(topic))
      Endpoint.subscribe("presence:#{room.id}")
    end

    socket =
      socket
      |> assign(room_pid: room_pid)
      |> assign(room: room)
      |> assign(chat_pid: chat_pid)
      |> assign(chat: chat)
      |> assign(playlist_pid: playlist_pid)
      |> assign(playlist: playlist)
      |> assign(video_pid: video_pid)
      |> assign(scheduler_pid: scheduler_pid)
      |> assign(current_video: video.current_video)
      |> assign(polls: polls)
      |> assign(topic: topic)
      |> assign(presence: Presence.list(topic))
      |> assign(autopause: video.autopause)
      |> assign(controls: RoomAgent.controls?(room_pid, socket.assigns.current_scope))

    {:ok, socket}
  end

  def terminate(_reason, socket) do
    room_id = socket.assigns.room.id
    Presence.untrack(self(), socket.assigns.topic, socket.assigns.current_scope.id)

    presences = Presence.list(socket.assigns.topic)
    Endpoint.broadcast("presence:#{room_id}", "update", presences)

    time =
      presences
      |> Enum.map(&elem(&1, 1))
      |> Enum.map(& &1.metas)
      |> List.flatten()
      |> Enum.map(& &1.buffered)
      |> case do
        [] -> 0
        times -> Enum.min(times)
      end

    ProcessRegistry.lookup(socket.assigns.room.id, VideoAgent)
    |> VideoAgent.set_autopause_time(time)

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
    {:noreply, assign(socket, playlist: playlist)}
  end

  def handle_info(%{topic: "video:" <> _, event: "set", payload: video}, socket) do
    video_info =
      with %Video{} <- video do
        %{
          type: video.type,
          video_url: video.video_url,
          subtitles_url: video.subtitles_url
        }
      else
        _ -> %{type: "default", video_url: nil, subtitles_url: nil}
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

  def handle_info(%{topic: "video:" <> _, event: "autopause", payload: autopause}, socket) do
    {:noreply, assign(socket, autopause: autopause)}
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
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
      PlaylistAgent.add_to_queue(socket.assigns.playlist_pid, video_url, subtitles_url, [])
    end

    {:noreply, socket}
  end

  def handle_event("playlist_remove", %{"id" => id}, socket) do
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
      PlaylistAgent.remove_from_queue(socket.assigns.playlist_pid, id)
    end

    {:noreply, socket}
  end

  def handle_event("playlist_set", %{"id" => id}, socket) do
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
      VideoAgent.set_video(socket.assigns.video_pid, id)
    end

    {:noreply, socket}
  end

  def handle_event("playlist_order", orders, socket) do
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
      PlaylistAgent.reorder(socket.assigns.playlist_pid, orders)
    end

    {:noreply, socket}
  end

  def handle_event("video_next", _params, socket) do
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
      VideoAgent.next_video(socket.assigns.video_pid)
    end

    {:noreply, socket}
  end

  def handle_event("video_playing", %{"playing" => playing, "offset" => offset}, socket) do
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
      if playing do
        VideoAgent.set_dtime(socket.assigns.video_pid, offset)
      end

      VideoAgent.set_playing(socket.assigns.video_pid, playing)

      VideoScheduler.stop_play(socket.assigns.scheduler_pid)
    end

    {:noreply, socket}
  end

  def handle_event("video_seek", %{"time" => time}, socket) do
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
      VideoAgent.set_time(socket.assigns.video_pid, time)
    end

    {:noreply, socket}
  end

  def handle_event("poll_create", %{"name" => name} = params, socket) do
    if RoomAgent.controls?(socket.assigns.room_pid, socket.assigns.current_scope) do
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
    end

    {:noreply, socket}
  end

  def handle_event("ping", _, socket) do
    {:reply, %{}, socket}
  end

  def handle_event("buffered", %{"buffered" => buffered}, socket) do
    Presence.update(self(), socket.assigns.topic, socket.assigns.current_scope.id, %{
      scope: socket.assigns.current_scope,
      buffered: buffered
    })

    presences = Presence.list(socket.assigns.topic)

    Endpoint.broadcast("presence:#{socket.assigns.room.id}", "update", presences)

    time =
      presences
      |> Enum.map(&elem(&1, 1))
      |> Enum.map(& &1.metas)
      |> List.flatten()
      |> Enum.map(& &1.buffered)
      |> case do
        [] -> 0
        times -> Enum.min(times)
      end

    ProcessRegistry.lookup(socket.assigns.room.id, VideoAgent)
    |> VideoAgent.set_autopause_time(time)

    {:noreply, socket}
  end
end
