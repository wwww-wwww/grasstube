defmodule GrasstubeWeb.PlaylistAgent do
  use Agent
  require Logger

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.VideoAgent
  alias GrasstubeWeb.Video

  defstruct videos: %{},
            queue: [],
            current_qid: 0,
            room_name: ""

  @yt_domains ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"]
  @gdrive_domains ["drive.google.com", "www.drive.google.com", "docs.google.com", "www.docs.google.com"]
  @yt_timeout 10000
  @ffprobe_timeout 10000

  def start_link(room_name) do
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :playlist})
  end

  def get_room_name(pid) do
    Agent.get(pid, fn val -> val.room_name end)
  end

  def get_video(pid, id) do
    Agent.get(pid, fn val -> 
      case val.videos[id] do
        nil -> :nothing
        _ -> val.videos[id]
      end
    end)
  end

  def get_queue(pid) do
    Agent.get(pid, fn val -> val.queue end)
  end

  def set_queue(pid, queue) do
    Agent.update(pid, fn val ->
      %{val | queue: queue}
    end)

    Endpoint.broadcast("playlist:" <> get_room_name(pid), "playlist", %{ playlist: get_playlist(pid) })
  end

  def get_playlist(pid) do
    get_queue(pid)
    |> Enum.map(fn id ->
      vid = get_video(pid, id)

      url =
        if vid.type == "yt",
          do: URI.merge(URI.parse("https://youtu.be/"), vid.url) |> to_string(),
          else: ""

      %{id: id, title: vid.title, url: url, duration: vid.duration}
    end)
  end
  
  def add_queue(pid, title, url, sub, small) do
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
    Endpoint.broadcast("playlist:" <> room_name, "playlist", %{ playlist: get_playlist(pid) })

    queue_id = Agent.get(pid, fn val -> val.current_qid - 1 end)

    Task.Supervisor.async_nolink(Tasks, fn -> queue_lookup(pid, room_name, queue_id, title, url, sub, small) end)
  end

  def update_queue_item(pid, queue_id, opts) do
    Agent.update(pid, fn val ->
      new_videos = Map.update(val.videos, queue_id, %Video{}, fn video ->
        Map.merge(video, opts)
      end)
      %{val | videos: new_videos}
    end)
  end

  def remove_queue(pid, id) do
    Agent.update(pid, fn val ->
      new_videos = Map.drop(val.videos, [id])
      new_queue = Enum.filter(val.queue, fn q_v -> q_v != id end)
      %{val | queue: new_queue, videos: new_videos}
    end)

    room_name = get_room_name(pid)

    video = Grasstube.ProcessRegistry.lookup(room_name, :video)
    current = VideoAgent.get_current_video(video)

    if current != :nothing and current.id == id do
      VideoAgent.set_current_video(video, :nothing)
      Endpoint.broadcast("playlist:" <> room_name, "current", %{id: -1})
      Endpoint.broadcast("video:" <> room_name, "setvid", %{id: -1, type: "default", url: "", sub: "", small: ""})
      Endpoint.broadcast("video:" <> room_name, "playing", %{playing: false})
    end
    
    Endpoint.broadcast("playlist:" <> room_name, "playlist", %{ playlist: get_playlist(pid) })
  end

  def get_yt_info(url) do
    case System.cmd("youtube-dl", ["-s", "-q", "--get-title", "--get-id", "--get-duration", url]) do
      {output, 0} ->

        [title, id, duration] = output |> String.trim |> String.split("\n")

        seconds = duration
        |> String.split(":")
        |> Enum.map(&String.to_integer/1)
        |> Enum.reverse
        |> Enum.with_index
        |> Enum.map(fn {v, k} -> v * :math.pow(60, k) end)
        |> Enum.sum

        {:ok, %{id: id, duration: seconds, title: title}}

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

  def queue_lookup(pid, room_name, queue_id, custom_title, url, sub, small) do
    success = case URI.parse(url) do
      %URI{host: nil} ->
        update_queue_item(pid, queue_id, %{title: "failed", ready: :failed})
        false

      %URI{host: host} ->
        cond do
          Enum.member?(@yt_domains, String.downcase(host)) ->
            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

            case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
              {:ok, {:ok, %{id: id, duration: duration, title: new_title}}} ->
                title = if custom_title |> String.length > 0, do: custom_title, else: new_title
                update_queue_item(pid, queue_id, %{title: title, url: id, sub: sub, type: "yt", duration: duration, ready: true})
                true

              _ ->
                update_queue_item(pid, queue_id, %{title: "failed", ready: :failed})
                false
            end

          Enum.member?(@gdrive_domains, String.downcase(host)) ->
            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

            case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
              {:ok, {:ok, %{id: id, duration: duration, title: new_title}}} ->
                title = if custom_title |> String.length > 0, do: custom_title, else: new_title
                update_queue_item(pid, queue_id, %{title: title, url: id, sub: sub, type: "gdrive", duration: duration, ready: true})
                true

              _ ->
                update_queue_item(pid, queue_id, %{title: "failed", ready: :failed})
                false
            end

          true ->
            title =
              url
              |> URI.decode()
              |> Path.basename()

            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_file_duration(url) end)

            case Task.yield(info_task, @ffprobe_timeout) || Task.shutdown(info_task) do
              {:ok, duration} ->
                update_queue_item(pid, queue_id, %{title: title, url: url, sub: sub, small: small, type: "default", duration: duration, ready: true})
                true

              _ ->
                update_queue_item(pid, queue_id, %{title: "failed"})
                false
            end
        end
    end

    if success do
      video = Grasstube.ProcessRegistry.lookup(room_name, :video)
      current_video = VideoAgent.get_current_video(video)
      if current_video != :nothing and current_video.id == queue_id do
        VideoAgent.set_current_video(video, get_video(pid, queue_id))
        
        if VideoAgent.play_on_ready?(video) do
          Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)
          |> GrasstubeWeb.VideoScheduler.delayed_start(5000)
        end
      end
    end

    Endpoint.broadcast("playlist:" <> room_name, "playlist", %{ playlist: get_playlist(pid) })
  end

  def next_video(pid) do
    queue = get_queue(pid)

    room_name = get_room_name(pid)

    video = Grasstube.ProcessRegistry.lookup(room_name, :video)
    
    next =
      case VideoAgent.get_current_video(video) do
        :nothing ->
          case queue |> Enum.at(0) do
            nil -> :nothing
            id -> get_video(pid, id)
          end
          
        current ->
          get_next_video(pid, queue, current.id)
      end

    if next != :nothing do
      case next.ready do
        :failed ->
          next_video(pid)

        true ->
          VideoAgent.set_current_video(video, next)
          Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)
          |> GrasstubeWeb.VideoScheduler.delayed_start(5000)

        false ->
          VideoAgent.set_play_on_ready(video, true)
          VideoAgent.set_current_video(video, next)
      end
    else
      VideoAgent.set_current_video(video, next)
    end
  end

  def get_next_video(pid, queue, id) do
    case queue |> Enum.at(Enum.find_index(queue, fn val -> val == id end) + 1) do
      nil -> :nothing
      id ->
        video = get_video(pid, id)
        if video.ready == :failed do
          get_next_video(pid, queue, video.id)
        else
          video
        end
    end
  end
end
