defmodule Grasstube.PlaylistAgent do
  use Agent
  import Ecto.Query, only: [from: 2]

  alias Grasstube.{Repo, VideoAgent, Video, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  @ffprobe_timeout 10000
  @ffprobe_command [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1"
  ]
  @yt_domains ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"]
  @yt_timeout 30000

  defstruct room_id: nil,
            videos: []

  def start_link(room) do
    Agent.start_link(
      fn ->
        videos =
          from(v in Video, where: v.room_id == ^room.id)
          |> Repo.all()
          |> Enum.sort_by(&{&1.order, &1.inserted_at})

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
          |> Enum.sort_by(&{&1.order, &1.inserted_at})

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
    uri = URI.parse(video_url)

    cond do
      uri.host == nil -> update_video(video, %{title: "Invalid video"})
      Enum.member?(@yt_domains, String.downcase(uri.host)) -> youtube(video, uri)
      true -> default(video, video_url)
    end
  end

  def add_to_queue(pid, video_url, subtitles_url, _alts) do
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
        task = Task.Supervisor.async_nolink(Tasks, fn -> queue_lookup(video) end)

        Process.demonitor(task.ref)

        update_videos(pid)

      {:error, error} ->
        IO.inspect(error)
        nil
    end
  end

  def remove_from_queue(pid, id) do
    room_id = get(pid).room_id
    video_pid = ProcessRegistry.lookup(room_id, VideoAgent)

    with %Video{} = video <- Repo.get(Video, id) do
      current_video = VideoAgent.get(video_pid).current_video

      if current_video != nil and current_video.id == video.id do
        VideoAgent.set_video(video_pid, nil)
      end

      Repo.delete(video)
      update_videos(pid)
    end
  end

  def reorder(pid, orders) do
    Repo.transact(fn ->
      Enum.each(orders, fn [index, id] ->
        {:ok, _} =
          Repo.get(Video, id)
          |> Ecto.Changeset.change(%{order: index})
          |> Repo.update()
      end)

      {:ok, nil}
    end)
    |> case do
      {:ok, nil} -> update_videos(pid)
      _ -> nil
    end
  end

  defp get_file_duration(url) do
    with {output, 0} <- System.cmd("ffprobe", @ffprobe_command ++ [url]) do
      {:ok, output |> String.trim() |> Float.parse() |> elem(0)}
    else
      err -> err
    end
  end

  defp wait_task(task, timeout) do
    case Task.yield(task, timeout) || Task.shutdown(task) do
      {:ok, resp} -> resp
      resp -> resp
    end
  end

  defp default(video, video_url) do
    with info_task <- Task.Supervisor.async_nolink(Tasks, fn -> get_file_duration(video_url) end),
         {:ok, duration} <- wait_task(info_task, @ffprobe_timeout) do
      title = Path.basename(URI.decode(video_url))

      update_video(video, %{
        type: "default",
        title: title,
        duration: duration,
        ready: true
      })
    else
      err -> update_video(video, %{title: "Error: #{inspect(err)}"})
    end
  end

  defp get_yt_playlist(id) do
    with {output, _} <-
           System.cmd(Application.get_env(:grasstube, :ytdl), ["-j", "--flat-playlist", id]) do
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
        [] -> "No results"
        results -> {:ok, results}
      end
    else
      err -> err
    end
  end

  defp get_yt_info(url) do
    with {output, 0} <- System.cmd(Application.get_env(:grasstube, :ytdl), ["-j", url]),
         {:ok, video} <- Jason.decode(output) do
      %{id: video["id"], duration: video["duration"], title: video["title"]}
    else
      err -> err
    end
  end

  defp youtube(video, %URI{query: query} = uri) do
    query
    |> Kernel.||("")
    |> URI.decode_query()
    |> case do
      %{"list" => list} ->
        with info_task <- Task.Supervisor.async_nolink(Tasks, fn -> get_yt_playlist(list) end),
             {:ok, [first | rest]} <- wait_task(info_task, @yt_timeout) do
          Enum.each(rest, fn %{id: id, title: title, duration: duration} ->
            %Video{
              room_id: video.room_id,
              type: "youtube",
              video_url: id,
              title: title,
              duration: duration + 0.0,
              ready: true
            }
            |> Repo.insert()
          end)

          update_video(video, %{
            type: "youtube",
            video_url: first.id,
            title: first.title,
            duration: first.duration + 0.0,
            ready: true
          })
        else
          err -> update_video(video, %{title: "Error: #{inspect(err)}"})
        end

      _ ->
        with info_task <-
               Task.Supervisor.async_nolink(Tasks, fn -> get_yt_info(URI.to_string(uri)) end),
             %{id: id, title: title, duration: duration} <- wait_task(info_task, @yt_timeout) do
          update_video(video, %{
            type: "youtube",
            video_url: id,
            title: title,
            duration: duration + 0.0,
            ready: true
          })
        else
          err -> update_video(video, %{title: "Error: #{inspect(err)}"})
        end
    end
  end
end
