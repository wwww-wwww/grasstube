defmodule Grasstube.VideoAgent do
  use Agent

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{ProcessRegistry, Repo, Video, VideoScheduler, PlaylistAgent}

  defstruct room_id: nil,
            current_video: nil,
            playing: false,
            time: 0,
            time_started: 0,
            speed: 1,
            room: nil

  def start_link(room) do
    Agent.start_link(fn -> %__MODULE__{room_id: room.id} end,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def get(pid), do: Agent.get(pid, & &1)

  defp current_time() do
    DateTime.utc_now()
    |> DateTime.to_unix(:millisecond)
    |> Kernel./(1000)
  end

  def set_video(pid, id) do
    video =
      case id do
        nil -> nil
        _ -> Repo.get(Video, id)
      end

    room_id =
      Agent.get_and_update(pid, fn state ->
        {state.room_id,
         %{state | playing: false, time: 0, time_started: current_time(), current_video: video}}
      end)

    ProcessRegistry.lookup(room_id, VideoScheduler)
    |> VideoScheduler.stop_next()

    Endpoint.broadcast("video:#{room_id}", "set", video)

    pid
  end

  def next_video(pid) do
    state = get(pid)

    videos =
      ProcessRegistry.get(state.room_id, PlaylistAgent).videos
      |> Enum.sort_by(& &1.inserted_at)

    next_video =
      case state do
        %{current_video: nil} ->
          videos |> Enum.take(1)

        %{current_video: current_video} ->
          videos
          |> Enum.drop_while(&(&1.id != current_video.id))
          |> Enum.drop(1)
          |> Enum.take(1)
      end
      |> Enum.map(& &1.id)
      |> Enum.at(0)

    set_video(pid, next_video)
  end

  def set_playing(pid, playing) do
    room_id =
      Agent.get_and_update(pid, fn state ->
        state =
          if playing != state.playing,
            do: %{state | playing: playing, time: get_time(state), time_started: current_time()},
            else: state

        {state.room_id, state}
      end)

    scheduler = ProcessRegistry.lookup(room_id, VideoScheduler)

    if playing do
      VideoScheduler.start_sync(scheduler)
    else
      VideoScheduler.stop_sync(scheduler)
    end

    Endpoint.broadcast("video:#{room_id}", "playing", playing)

    pid
  end

  def get_time(%__MODULE__{} = state) do
    if state.playing,
      do: state.time + (current_time() - state.time_started) * state.speed,
      else: state.time
  end

  def get_time(pid) do
    Agent.get(pid, &get_time/1)
  end

  def set_time(pid, t) do
    room_id =
      Agent.get_and_update(pid, fn state ->
        {state.room_id, %{state | time: t, time_started: current_time()}}
      end)

    Endpoint.broadcast("video:#{room_id}", "time", t)

    pid
  end

  def set_dtime(pid, d) do
    {room_id, t} =
      Agent.get_and_update(pid, fn state ->
        {{state.room_id, state.time + d}, %{state | time: state.time + d}}
      end)

    Endpoint.broadcast("video:#{room_id}", "time", t)

    pid
  end
end
