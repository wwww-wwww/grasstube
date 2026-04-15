defmodule Grasstube.PlaylistAgent do
  use Agent
  import Ecto.Query, only: [from: 2]

  alias Grasstube.{Repo, Room, VideoAgent, Video, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  @ffprobe_timeout 10000

  defstruct room_id: nil,
            videos: []

  def start_link(room) do
    Agent.start_link(
      fn ->
        videos =
          from(v in Video, where: v.room_id == ^room.id)
          |> Repo.all()

        %__MODULE__{room_id: room.id, videos: videos}
      end,
      name: ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def get(pid), do: Agent.get(pid, & &1)

  def update_videos(pid) do
    {room_id, videos} =
      Agent.get_and_update(pid, fn state ->
        videos =
          from(v in Video, where: v.room_id == ^state.room_id)
          |> Repo.all()

        {{state.room_id, videos}, %{state | videos: videos}}
      end)

    Endpoint.broadcast("playlist:#{room_id}", "playlist", videos)
  end

  defp update_video(video, params) do
    video
    |> Ecto.Changeset.change(params)
    |> Repo.update()

    ProcessRegistry.lookup(video.room_id, __MODULE__)
    |> update_videos()
  end

  defp queue_lookup(%Video{video_url: video_url} = video) do
    case URI.parse(video_url) do
      %URI{host: nil} ->
        update_video(video, %{title: "Invalid video"})

      %URI{host: host, query: query} ->
        info_task = Task.Supervisor.async_nolink(Tasks, fn -> get_file_duration(video_url) end)

        case Task.yield(info_task, @ffprobe_timeout) || Task.shutdown(info_task) do
          {:ok, duration} ->
            title = Path.basename(URI.decode(video_url))

            update_video(video, %{
              type: "default",
              title: title,
              duration: duration,
              ready: true
            })

          _ ->
            update_video(video, %{title: "Timed out"})
        end
    end
  end

  def add_to_queue(pid, video_url, subtitles_url, alts) do
    room_id = get(pid).room_id

    %Video{
      title: "Loading",
      room_id: room_id,
      video_url: video_url,
      subtitles_url: subtitles_url
    }
    |> Repo.insert()
    |> case do
      {:ok, video} ->
        task =
          Task.Supervisor.async_nolink(Tasks, fn ->
            queue_lookup(video)
          end)

        Process.demonitor(task.ref)

        update_videos(pid)

      {:error, error} ->
        nil
    end
  end

  def remove_from_queue(pid, id) do
    Repo.get(Video, id)
    |> case do
      nil ->
        nil

      video ->
        Repo.delete(video)
        update_videos(pid)
    end
  end

  defp get_file_duration(url) do
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

      err ->
        IO.inspect(err)
        :error
    end
  end
end
