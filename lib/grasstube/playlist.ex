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

  def start_link(opts) do
    Logger.info("Starting playlist agent.")
    [room_name: room_name] ++ _ = opts
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :playlist})
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

  def add_queue(pid, title, url, sub, small, type, duration) do
    Agent.update(pid, fn val ->
      new_videos =
        Map.put(val.videos, val.current_qid, %Video{
          id: val.current_qid,
          title: title,
          url: url,
          sub: sub,
          small: small,
          type: type,
          duration: duration
        })

      new_queue = val.queue ++ [val.current_qid]

      %{val | videos: new_videos, queue: new_queue, current_qid: val.current_qid + 1}
    end)
  end

  def remove_queue(pid, id) do
    Agent.update(pid, fn val ->
      new_videos = Map.drop(val.videos, [id])
      new_queue = Enum.filter(val.queue, fn q_v -> q_v != id end)
      %{val | queue: new_queue, videos: new_videos}
    end)

    room_name = Agent.get(pid, fn val -> val.room_name end)
    video = Grasstube.ProcessRegistry.lookup(room_name, :video)

    current = VideoAgent.get_current_video(video)

    room_name = Agent.get(pid, fn val -> val.room_name end)

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

  def q_add(pid, url, sub, small) do
    case URI.parse(url) do
      %URI{host: nil} ->
        nil

      %URI{host: host} ->
        cond do
          Enum.member?(@yt_domains, String.downcase(host)) ->
            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

            case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
              {:ok, {:ok, %{id: id, duration: duration, title: title}}} ->
                add_queue(pid, title, id, sub, "", "yt", duration)

              _ ->
                IO.inspect("FAILED YT")
                :failed
            end

          Enum.member?(@gdrive_domains, String.downcase(host)) ->
            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(url) end)

            case Task.yield(info_task, @yt_timeout) || Task.shutdown(info_task) do
              {:ok, {:ok, %{id: id, duration: duration, title: title}}} ->
                add_queue(pid, title, id, sub, "", "gdrive", duration)

              _ ->
                IO.inspect("FAILED GDRIVE")
                :failed
            end

          true ->
            title =
              url
              |> URI.decode()
              |> Path.basename()

            info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_file_duration(url) end)

            case Task.yield(info_task, @ffprobe_timeout) || Task.shutdown(info_task) do
              {:ok, duration} ->
                add_queue(pid, title, url, sub, small, "default", duration)

              _ ->
                IO.inspect("FAILED")
                :failed
            end
        end

        room_name = Agent.get(pid, fn val -> val.room_name end)
        Endpoint.broadcast("playlist:" <> room_name, "playlist", %{ playlist: get_playlist(pid) })
    end
  end

  def next_video(pid) do
    queue = get_queue(pid)

    room_name = Agent.get(pid, fn val -> val.room_name end)

    video = Grasstube.ProcessRegistry.lookup(room_name, :video)
    
    next =
      case VideoAgent.get_current_video(video) do
        :nothing ->
          case queue |> Enum.at(0) do
            nil -> :nothing
            id -> get_video(pid, id)
          end
          
        current ->
          case queue |> Enum.at(Enum.find_index(queue, fn val -> val == current.id end) + 1) do
            nil -> :nothing
            id -> get_video(pid, id)
          end
      end
      
    VideoAgent.set_current_video(video, next)
    if next != :nothing do
      scheduler = Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)
      GrasstubeWeb.VideoScheduler.delayed_start(scheduler, 5000)
    end
  end
end
