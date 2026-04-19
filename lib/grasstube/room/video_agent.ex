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
            autopause: false,
            autopaused: false,
            autopause_time: 0

  def start_link(room) do
    Agent.start_link(fn -> %__MODULE__{room_id: room.id, autopause: room.autopause} end,
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
    video = if id, do: Repo.get(Video, id), else: nil

    room_id =
      Agent.get_and_update(pid, fn state ->
        {state.room_id,
         %{state | playing: false, time: 0, time_started: current_time(), current_video: video}}
      end)

    scheduler = ProcessRegistry.lookup(room_id, VideoScheduler)

    VideoScheduler.stop_next(scheduler)

    if id do
      VideoScheduler.start_sync(scheduler)
    else
      VideoScheduler.stop_sync(scheduler)
    end

    Endpoint.broadcast("video:#{room_id}", "set", video)

    pid
  end

  def next_video(pid) do
    state = get(pid)

    videos = ProcessRegistry.get(state.room_id, PlaylistAgent).videos

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
          if playing != state.playing do
            %{
              state
              | playing: playing,
                time: get_time(state),
                time_started: current_time(),
                autopaused: false
            }
          else
            %{state | autopaused: false}
          end

        {state.room_id, state}
      end)

    scheduler = ProcessRegistry.lookup(room_id, VideoScheduler)

    if playing do
      VideoScheduler.start_sync(scheduler)
    else
      VideoScheduler.stop_sync(scheduler)
    end

    Endpoint.broadcast("video:#{room_id}", "playing", playing)

    check_autopause(pid)

    pid
  end

  def get_time(%__MODULE__{} = state) do
    if state.playing and not state.autopaused,
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

    check_autopause(pid)

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

  def set_autopause(pid, b) do
    room_id = Agent.get_and_update(pid, &{&1.room_id, %{&1 | autopause: b}})
    Endpoint.broadcast("video:#{room_id}", "autopause", b)
  end

  def set_autopause_time(pid, time) do
    Agent.update(pid, &%{&1 | autopause_time: time})
    check_autopause(pid)
  end

  def check_autopause(pid) do
    Agent.get_and_update(pid, fn state ->
      time = get_time(state)

      cond do
        not state.autopause ->
          {nil, state}

        state.autopaused and time < state.autopause_time ->
          {{:play, state.room_id}, %{state | autopaused: false, time_started: current_time()}}

        state.playing and time >= state.autopause_time ->
          t =
            if time - state.autopause_time < 1,
              do: state.autopause_time,
              else: time

          {{:pause, state.room_id},
           %{state | autopaused: true, time: t, time_started: current_time()}}

        true ->
          {nil, state}
      end
    end)
    |> case do
      {:play, room_id} ->
        Endpoint.broadcast("video:#{room_id}", "playing", true)

      {:pause, room_id} ->
        Endpoint.broadcast("video:#{room_id}", "playing", false)

      _ ->
        nil
    end
  end
end
