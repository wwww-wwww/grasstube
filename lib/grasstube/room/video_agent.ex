defmodule Grasstube.VideoAgent do
  use Agent

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{Repo, Video, VideoScheduler, ProcessRegistry}

  defstruct room_id: nil,
            current_video: nil,
            playing: false,
            time: 0,
            time_started: 0,
            speed: 1

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

    Endpoint.broadcast("video:#{room_id}", "set", video)

    pid
  end

  def set_playing(pid, playing) do
    room_id =
      Agent.get_and_update(pid, fn state ->
        state =
          if playing != state.playing do
            %{state | playing: playing, time: get_time(state), time_started: current_time()}
          else
            state
          end

        {state.room_id, state}
      end)

    scheduler = ProcessRegistry.lookup(room_id, VideoScheduler)

    if playing do
      VideoScheduler.start_timer(scheduler, 0)
    else
      VideoScheduler.stop_timer(scheduler)
    end

    Endpoint.broadcast("video:#{room_id}", "playing", playing)

    pid
  end

  def get_time(%__MODULE__{} = state) do
    if state.playing do
      now = current_time()
      state.time + (now - state.time_started) * state.speed
    else
      state.time
    end
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
