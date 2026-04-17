defmodule Grasstube.VideoScheduler do
  use GenServer

  alias Grasstube.{ProcessRegistry, VideoAgent, RoomAgent, ChatAgent}
  alias GrasstubeWeb.Endpoint

  @time_to_next 5
  @time_to_start 5

  defstruct room_id: nil, sync_task: nil, next_task: nil, play_task: nil

  def start_link(room) do
    GenServer.start_link(
      __MODULE__,
      %__MODULE__{room_id: room.id},
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def init(state) do
    {:ok, state}
  end

  def handle_info(:sync, state) do
    if state.sync_task do
      Process.cancel_timer(state.sync_task)
    end

    pid = ProcessRegistry.lookup(state.room_id, VideoAgent)
    video = VideoAgent.get(pid)

    if video.current_video do
      room = ProcessRegistry.get(state.room_id, RoomAgent)
      time = VideoAgent.get_time(video)

      Endpoint.broadcast("video:#{state.room_id}", "sync", %{
        time: time,
        playing: video.playing
      })

      if time - video.current_video.duration > 0 do
        VideoAgent.set_playing(pid, false)

        ChatAgent.basic_message("playing next video in #{@time_to_next + @time_to_start} seconds")
        |> ChatAgent.broadcast_to("system", state.room_id)

        start_next(self())
      end
    end

    {:noreply, %{state | sync_task: Process.send_after(self(), :sync, 2000)}}
  end

  def handle_info(:next, state) do
    ProcessRegistry.lookup(state.room_id, VideoAgent)
    |> VideoAgent.next_video()

    {:noreply, state}
  end

  def handle_cast(:start_sync, state) do
    {:noreply, %{state | sync_task: Process.send_after(self(), :sync, 0)}}
  end

  def handle_cast(:stop_sync, state) do
    new_state =
      if state.sync_task do
        Process.cancel_timer(state.sync_task)
        %{state | sync_task: nil}
      else
        state
      end

    {:noreply, new_state}
  end

  def handle_cast(:start_next, state) do
    {:noreply, %{state | next_task: Process.send_after(self(), :next, 5000)}}
  end

  def handle_cast(:stop_next, state) do
    new_state =
      if state.next_task do
        Process.cancel_timer(state.next_task)
        %{state | next_task: nil}
      else
        state
      end

    {:noreply, new_state}
  end

  def start_sync(scheduler) do
    GenServer.cast(scheduler, :start_sync)
  end

  def stop_sync(scheduler) do
    GenServer.cast(scheduler, :stop_sync)
  end

  def start_next(scheduler) do
    GenServer.cast(scheduler, :start_next)
  end

  def stop_next(scheduler) do
    GenServer.cast(scheduler, :stop_next)
  end
end
