defmodule Grasstube.PlaylistAgent do
  use Agent

  alias Grasstube.{Repo, Room, VideoAgent, Video, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  defstruct videos: [],
            queue: [],
            room_name: "",
            repeat_mode: :none,
            room: nil

  @yt_domains ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"]
  @gdrive_domains [
    "drive.google.com",
    "www.drive.google.com",
    "docs.google.com",
    "www.docs.google.com"
  ]
  @yt_timeout 30000
  @ffprobe_timeout 10000

  def start_link(room) do
    videos = Repo.preload(room, [:videos]).videos

    videos
    |> Enum.filter(&(&1.duration == nil))
    |> Enum.each(&Repo.delete/1)

    videos = Enum.filter(videos, &(&1.duration != nil))

    video_ids = Enum.map(videos, & &1.id)

    queue =
      room.queue
      |> Enum.filter(&(&1 in video_ids))
      |> Kernel.++(video_ids)
      |> Enum.uniq()

    Agent.start_link(
      fn ->
        %__MODULE__{
          room: room,
          videos: videos |> Enum.map(&{&1.id, &1}) |> Map.new(),
          room_name: room.title,
          queue: queue
        }
      end,
      name: via_tuple(room.title)
    )
  end

  def via_tuple(room_name), do: ProcessRegistry.via_tuple({room_name, :playlist})

  def get_room(pid), do: Agent.get(pid, & &1.room)

  def get_room_name(pid), do: Agent.get(pid, & &1.room_name)

  def get_video(pid, id) when is_integer(id),
    do: Agent.get(pid, &Map.get(&1.videos, id, :nothing))

  def get_video(pid, id) do
    {id, _} = Integer.parse(to_string(id))
    get_video(pid, id)
  end

  def get_queue(pid), do: Agent.get(pid, & &1.queue)

  def set_queue(pid, queue) do
    videos = Agent.get_and_update(pid, &{&1.videos, %{&1 | queue: queue}})

    room = get_room(pid)

    Room.changeset(room, %{queue: queue})
    |> Repo.update()

    Endpoint.broadcast("playlist:" <> room.title, "playlist", %{
      playlist: get_playlist(%{videos: videos, queue: queue})
    })
  end

  def get_playlist(%{videos: videos, queue: queue}),
    do: Enum.map(queue, &Map.get(videos, &1, :nothing))

  def get_playlist(pid), do: Agent.get(pid, fn state -> get_playlist(state) end)

  def get_index(pid, id) do
    Agent.get(pid, fn state -> Enum.find_index(state.queue, &(&1 == id)) end) || 0
  end

  def get_repeat_mode(pid), do: Agent.get(pid, & &1.repeat_mode)

  def set_repeat_mode(pid, mode) do
    Agent.update(pid, &%{&1 | repeat_mode: mode})

    Endpoint.broadcast("playlist:" <> get_room_name(pid), "repeat", %{
      repeat: mode
    })
  end

  def add_queue(pid, title, url, sub, alts) do
    room = get_room(pid)

    Ecto.build_assoc(room, :videos)
    |> Video.changeset(%{title: "loading", url: url})
    |> Repo.insert()
    |> case do
      {:ok, video} ->
        {new_playlist, queue} =
          Agent.get_and_update(pid, fn val ->
            queue = val.queue ++ [video.id]
            val = %{val | videos: Map.put(val.videos, video.id, video), queue: queue}
            {{get_playlist(val), queue}, val}
          end)

        Room.changeset(room, %{queue: queue})
        |> Repo.update()

        Endpoint.broadcast("playlist:" <> room.title, "playlist", %{playlist: new_playlist})

        Task.Supervisor.async_nolink(Tasks, fn ->
          queue_lookup(pid, room, video, title, url, sub, alts)
        end)

      err ->
        IO.inspect(err)
    end
  end

  def update_queue_item(pid, video, opts) do
    Video.changeset(video, opts)
    |> Repo.update()
    |> case do
      {:ok, video} -> Agent.update(pid, &%{&1 | videos: Map.put(&1.videos, video.id, video)})
      err -> IO.inspect(err)
    end
  end

  def insert_queue(pid, video, videos) do
    Agent.update(pid, fn val ->
      multi =
        Ecto.Multi.new()
        |> Ecto.Multi.update(:first, Video.changeset(video, Enum.at(videos, 0)))

      {new_videos, video_ids} =
        videos
        |> Enum.drop(1)
        |> Enum.map(
          &(Ecto.build_assoc(val.room, :videos)
            |> Video.changeset(&1))
        )
        |> Enum.with_index()
        |> Enum.reduce(multi, fn {changeset, i}, acc ->
          Ecto.Multi.insert(acc, i, changeset)
        end)
        |> Repo.transaction()
        |> case do
          {:ok, videos} ->
            {
              Map.values(videos) |> Enum.reduce(val.videos, &Map.put(&2, &1.id, &1)),
              videos
              |> Enum.filter(&(elem(&1, 0) != :first))
              |> Enum.sort_by(&elem(&1, 0))
              |> Enum.map(&elem(&1, 1).id)
            }

          err ->
            IO.inspect(err)
            {val.videos, []}
        end

      {right, left} =
        val.queue
        |> Enum.reverse()
        |> Enum.split_while(&(&1 != video.id))

      new_queue = Enum.reverse(right ++ Enum.reverse(video_ids) ++ left)
      %{val | videos: new_videos, queue: new_queue}
    end)
  end

  def remove_queue(pid, id) when is_integer(id) do
    Repo.get(Video, id) |> Repo.delete()

    Agent.update(pid, fn val ->
      new_videos = Map.drop(val.videos, [id])
      new_queue = Enum.filter(val.queue, &(&1 != id))
      %{val | queue: new_queue, videos: new_videos}
    end)

    room_name = get_room_name(pid)

    video = ProcessRegistry.lookup(room_name, :video)
    current = VideoAgent.get_current_video(video)

    if current != :nothing and current.id == id do
      VideoAgent.set_current_video(video, :nothing)
      Endpoint.broadcast("playlist:" <> room_name, "current", %{id: -1})
    end

    Endpoint.broadcast("playlist:" <> room_name, "playlist", %{playlist: get_playlist(pid)})
  end

  def remove_queue(pid, id) do
    {id, _} = Integer.parse(to_string(id))
    remove_queue(pid, id)
  end

  def get_yt_info(url) do
    case System.cmd(Application.get_env(:grasstube, :ytdl), ["-j", url]) do
      {output, 0} ->
        case Jason.decode(output) do
          {:ok, video} ->
            {:ok, %{id: video["id"], duration: video["duration"], title: video["title"]}}

          _ ->
            :error
        end

      _ ->
        :error
    end
  end

  def get_yt_playlist(id) do
    case System.cmd(Application.get_env(:grasstube, :ytdl), ["-j", "--flat-playlist", id]) do
      {output, _} ->
        output
        |> String.trim()
        |> String.split("\n")
        |> Stream.map(&Jason.decode(&1))
        |> Stream.filter(&(elem(&1, 0) == :ok))
        |> Stream.map(&elem(&1, 1))
        |> Enum.map(
          &%{
            id: &1["id"],
            duration: &1["duration"],
            title: &1["title"]
          }
        )
        |> case do
          [] ->
            :error

          results ->
            {:ok, results}
        end

      _ ->
        :error
    end
  end

  def get_file_duration(url) do
    case System.cmd("ffprobe", [
           "-v",
           "error",
           "-show_entries",
           "format=duration",
           "-of",
           "default=noprint_wrappers=1:nokey=1",
           url
         ]) do
      {output, 0} ->
        output
        |> IO.inspect()
        |> String.trim()
        |> Float.parse()
        |> elem(0)
        |> IO.inspect()

      err ->
        IO.inspect(err)
        :error
    end
  end

  def queue_lookup(pid, room, video, custom_title, url, sub, alts) do
    case URI.parse(url) do
      %URI{host: nil} ->
        update_queue_item(pid, video, %{title: "bad uri", ready: false})
        false

      %URI{host: host, query: query} ->
        cond do
          Enum.member?(@yt_domains, String.downcase(host)) ->
            query
            |> Kernel.||("")
            |> String.split("&")
            |> Enum.map(&(String.split(&1, "=") |> List.to_tuple()))
            |> Enum.filter(&(elem(&1, 0) == "list"))
            |> Enum.at(0)
            |> case do
              {"list", list} ->
                info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_playlist(list) end)

                case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
                  {:ok, {:ok, videos}} ->
                    videos =
                      videos
                      |> Enum.map(
                        &%{
                          title: &1.title,
                          url: &1.id,
                          sub: nil,
                          type: "yt",
                          duration: &1.duration,
                          ready: true
                        }
                      )

                    insert_queue(pid, video, videos)
                    true

                  _ ->
                    update_queue_item(pid, video, %{title: "failed", ready: false})
                    false
                end

              _ ->
                info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

                case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
                  {:ok, {:ok, %{id: id, duration: duration, title: new_title}}} ->
                    title = if String.length(custom_title) > 0, do: custom_title, else: new_title

                    update_queue_item(pid, video, %{
                      title: title,
                      url: id,
                      sub: sub,
                      type: "yt",
                      duration: duration,
                      ready: true
                    })

                    true

                  _ ->
                    update_queue_item(pid, video, %{title: "failed", ready: false})
                    false
                end
            end

          Enum.member?(@gdrive_domains, String.downcase(host)) ->
            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

            case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
              {:ok, {:ok, %{id: id, duration: duration, title: new_title}}} ->
                title = if String.length(custom_title) > 0, do: custom_title, else: new_title

                update_queue_item(pid, video, %{
                  title: title,
                  url: id,
                  sub: sub,
                  type: "gdrive",
                  duration: duration,
                  ready: true
                })

                true

              _ ->
                update_queue_item(pid, video, %{title: "failed", ready: false})
                false
            end

          true ->
            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_file_duration(url) end)

            case Task.yield(info_task, @ffprobe_timeout) || Task.shutdown(info_task) do
              {:ok, duration} ->
                title =
                  if String.length(custom_title) > 0,
                    do: custom_title,
                    else: Path.basename(URI.decode(url))

                update_queue_item(pid, video, %{
                  title: title,
                  url: url,
                  sub: sub,
                  alts: alts,
                  type: "default",
                  duration: duration,
                  ready: true
                })

                true

              err ->
                update_queue_item(pid, video, %{title: inspect(err)})
                false
            end
        end
    end
    |> if do
      video_pid = ProcessRegistry.lookup(room.title, :video)
      current_video = VideoAgent.get_current_video(video_pid)

      if current_video != :nothing and current_video.id == video.id do
        VideoAgent.set_current_video(video_pid, get_video(pid, video.id))

        if VideoAgent.play_on_ready?(video_pid) do
          ProcessRegistry.lookup(room.title, :video_scheduler)
          |> Grasstube.VideoScheduler.delayed_start(5000)
        end
      end
    end

    Endpoint.broadcast("playlist:" <> room.title, "playlist", %{playlist: get_playlist(pid)})
  end

  def next_video(pid) do
    queue = get_queue(pid)

    room_name = get_room_name(pid)

    video = ProcessRegistry.lookup(room_name, :video)

    next =
      case VideoAgent.get_current_video(video) do
        :nothing ->
          case Enum.at(queue, 0) do
            nil -> :nothing
            id -> get_video(pid, id)
          end

        current ->
          case get_next_video(pid, get_index(pid, current.id)) do
            :current -> current
            new_video -> new_video
          end
      end

    if next != :nothing do
      case next.ready do
        :failed ->
          next_video(pid)

        true ->
          VideoAgent.set_current_video(video, next)

          ProcessRegistry.lookup(room_name, :video_scheduler)
          |> Grasstube.VideoScheduler.delayed_start(5000)

        false ->
          VideoAgent.set_play_on_ready(video, true)
          VideoAgent.set_current_video(video, next)
      end
    else
      VideoAgent.set_current_video(video, next)
    end
  end

  def get_next_video(
        state,
        index
      )
      when is_map(state) do
    case state.repeat_mode do
      :track ->
        :current

      repeat_mode ->
        case Enum.at(state.queue, index + 1) do
          nil ->
            if repeat_mode == :playlist,
              do: Map.get(state.videos, Enum.at(state.queue, 0), :nothing),
              else: :nothing

          id ->
            case Map.get(state.videos, id, :nothing) do
              %{ready: :failed} -> get_next_video(state, index + 1)
              video -> video
            end
        end
    end
  end

  def get_next_video(pid, current_id) do
    Agent.get(pid, &get_next_video(&1, current_id))
  end
end
