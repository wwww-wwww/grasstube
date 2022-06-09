defmodule Grasstube.PlaylistAgent do
  use Agent
  require Logger

  alias Grasstube.{VideoAgent, Video, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  defstruct videos: %{},
            queue: [],
            current_qid: 0,
            room_name: "",
            repeat_mode: :none

  @yt_domains ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"]
  @gdrive_domains [
    "drive.google.com",
    "www.drive.google.com",
    "docs.google.com",
    "www.docs.google.com"
  ]
  @yt_timeout 10000
  @ffprobe_timeout 10000

  def start_link(room_name) do
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name), do: ProcessRegistry.via_tuple({room_name, :playlist})

  def get_room_name(pid), do: Agent.get(pid, & &1.room_name)

  def get_videos(pid), do: Agent.get(pid, & &1.videos)

  def get_video(pid, id) when is_integer(id) do
    Agent.get(pid, &Map.get(&1.videos, id, :nothing))
  end

  def get_video(pid, id) do
    {id, _} = Integer.parse(to_string(id))
    get_video(pid, id)
  end

  def get_queue(pid), do: Agent.get(pid, & &1.queue)

  def set_queue(pid, queue) do
    Agent.update(pid, &%{&1 | queue: queue})

    Endpoint.broadcast("playlist:" <> get_room_name(pid), "playlist", %{
      playlist: get_playlist(pid)
    })
  end

  def get_playlist(pid) do
    Agent.get(pid, fn state ->
      state.queue
      |> Enum.map(&Map.get(state.videos, &1, :nothing))
    end)
  end

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
    Agent.update(pid, fn val ->
      new_videos =
        Map.put(val.videos, val.current_qid, %Video{
          id: val.current_qid,
          title: "loading",
          url: url
        })

      new_queue = val.queue ++ [val.current_qid]

      %{val | videos: new_videos, queue: new_queue, current_qid: val.current_qid + 1}
    end)

    room_name = get_room_name(pid)
    Endpoint.broadcast("playlist:" <> room_name, "playlist", %{playlist: get_playlist(pid)})

    queue_id = Agent.get(pid, &(&1.current_qid - 1))

    Task.Supervisor.async_nolink(Tasks, fn ->
      queue_lookup(pid, room_name, queue_id, title, url, sub, alts)
    end)
  end

  def update_queue_item(pid, queue_id, opts) do
    Agent.update(pid, fn val ->
      new_videos =
        Map.has_key?(val.videos, queue_id)
        |> if do
          Map.update(val.videos, queue_id, %Video{}, &Map.merge(&1, opts))
        else
          val.videos
        end

      %{val | videos: new_videos}
    end)
  end

  def insert_queue(pid, queue_id, videos) do
    Agent.update(pid, fn val ->
      new_videos =
        val.videos
        |> Map.update(queue_id, %Video{}, &%Video{Enum.at(videos, 0) | id: &1.id})

      {new_videos, queue, count} =
        videos
        |> Enum.drop(1)
        |> Enum.reduce({new_videos, [], val.current_qid}, fn video, {videos, queue, count} ->
          new_videos = Map.put(videos, count, %Video{video | id: count})

          {new_videos, queue ++ [count], count + 1}
        end)

      {right, left} =
        val.queue
        |> Enum.reverse()
        |> Enum.split_while(&(&1 != queue_id))

      new_queue = Enum.reverse(right ++ Enum.reverse(queue) ++ left)
      %{val | videos: new_videos, current_qid: count, queue: new_queue}
    end)
  end

  def remove_queue(pid, id) when is_integer(id) do
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
        case output |> Jason.decode() do
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
      {output, 0} ->
        results =
          output
          |> String.trim()
          |> String.split("\n")
          |> Enum.map(&Jason.decode(&1))
          |> Enum.map(&elem(&1, 1))
          |> Enum.map(
            &%{
              id: &1["id"],
              duration: &1["duration"],
              title: &1["title"]
            }
          )

        {:ok, results}

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
        |> String.trim()
        |> Float.parse()
        |> elem(0)

      _ ->
        :error
    end
  end

  def queue_lookup(pid, room_name, queue_id, custom_title, url, sub, alts) do
    case URI.parse(url) do
      %URI{host: nil} ->
        update_queue_item(pid, queue_id, %{title: "failed", ready: :failed})
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
                        &%Video{
                          title: &1.title,
                          url: &1.id,
                          sub: nil,
                          type: "yt",
                          duration: &1.duration,
                          ready: true
                        }
                      )

                    insert_queue(pid, queue_id, videos)

                    true

                  _ ->
                    update_queue_item(pid, queue_id, %{title: "failed", ready: :failed})
                    false
                end

              _ ->
                info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

                case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
                  {:ok, {:ok, %{id: id, duration: duration, title: new_title}}} ->
                    title = if String.length(custom_title) > 0, do: custom_title, else: new_title

                    update_queue_item(pid, queue_id, %{
                      title: title,
                      url: id,
                      sub: sub,
                      type: "yt",
                      duration: duration,
                      ready: true
                    })

                    true

                  _ ->
                    update_queue_item(pid, queue_id, %{title: "failed", ready: :failed})
                    false
                end
            end

          Enum.member?(@gdrive_domains, String.downcase(host)) ->
            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

            case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
              {:ok, {:ok, %{id: id, duration: duration, title: new_title}}} ->
                title = if String.length(custom_title) > 0, do: custom_title, else: new_title

                update_queue_item(pid, queue_id, %{
                  title: title,
                  url: id,
                  sub: sub,
                  type: "gdrive",
                  duration: duration,
                  ready: true
                })

                true

              _ ->
                update_queue_item(pid, queue_id, %{title: "failed", ready: :failed})
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

                update_queue_item(pid, queue_id, %{
                  title: title,
                  url: url,
                  sub: sub,
                  alts: alts,
                  type: "default",
                  duration: duration,
                  ready: true
                })

                true

              _ ->
                update_queue_item(pid, queue_id, %{title: "failed"})
                false
            end
        end
    end
    |> if do
      video = ProcessRegistry.lookup(room_name, :video)
      current_video = VideoAgent.get_current_video(video)

      if current_video != :nothing and current_video.id == queue_id do
        VideoAgent.set_current_video(video, get_video(pid, queue_id))

        if VideoAgent.play_on_ready?(video) do
          ProcessRegistry.lookup(room_name, :video_scheduler)
          |> Grasstube.VideoScheduler.delayed_start(5000)
        end
      end
    end

    Endpoint.broadcast("playlist:" <> room_name, "playlist", %{playlist: get_playlist(pid)})
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
