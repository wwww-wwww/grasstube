defmodule Grasstube.VideoScheduler do
  use GenServer

  alias Grasstube.{PlaylistAgent, VideoAgent, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  @time_to_next 5
  @time_to_start 5

  defstruct room_id: nil, sync_task: nil, set_task: nil, play_task: nil

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

  def handle_info(:delayed_start, state) do
    if state.play_task do
      Process.cancel_timer(state.play_task)
    end

    ProcessRegistry.lookup(state.room_id, VideoAgent)
    |> VideoAgent.set_playing(true)

    start_timer(self(), 0)
    Endpoint.broadcast("video:#{state.room_id}", "sync", %{playing: true, time: 0})

    {:noreply, %{state | play_task: nil}}
  end

  def handle_info({:delayed_set, playlist}, state) do
    PlaylistAgent.next_video(playlist)
    {:noreply, state}
  end

  def handle_info(:sync, state) do
    if state.sync_task do
      Process.cancel_timer(state.sync_task)
    end

    pid = ProcessRegistry.lookup(state.room_id, VideoAgent)

    new_state =
      case VideoAgent.get(pid) do
        %{current_video: nil} ->
          state

        %{current_video: video, playing: playing} = video_state ->
          time = VideoAgent.get_time(video_state)
          # scheduler = ProcessRegistry.lookup(state.room_id, VideoScheduler)

          Endpoint.broadcast("video:#{state.room_id}", "sync", %{
            time: time,
            playing: playing
          })

          %{state | sync_task: start_timer(self(), 2000)}

          # if !VideoAgent.check_autopause(pid) do
          #   Endpoint.broadcast("video:#{state.room_name}", "sync", %{
          #     time: time,
          #     playing: playing
          #   })

          #   if time - video.duration > 0 do
          #     Endpoint.broadcast("chat:#{state.room_name}", "chat", %{
          #       sender: "sys",
          #       name: "System",
          #       content: "playing next video in #{@time_to_next + @time_to_start} seconds"
          #     })

          #     playlist = ProcessRegistry.lookup(state.room_name, :playlist)

          #     %{
          #       state
          #       | set_task: Process.send_after(scheduler, {:delayed_set, playlist}, 5000),
          #         sync_task: :nothing
          #     }
          #   else
          #     %{state | sync_task: start_timer(scheduler, 2000)}
          #   end
          # else
          #   %{state | sync_task: start_timer(scheduler, 2000)}
          # end
      end

    {:noreply, new_state}
  end

  def handle_cast({:delayed_start, time}, state) do
    {:noreply, %{state | play_task: Process.send_after(self(), :delayed_start, time)}}
  end

  def handle_cast(:cancel_play, state) do
    new_state =
      if state.play_task do
        Process.cancel_timer(state.play_task)
        %{state | play_task: nil}
      else
        state
      end

    {:noreply, new_state}
  end

  def handle_cast(:cancel_set, state) do
    new_state =
      if state.set_task do
        Process.cancel_timer(state.set_task)
        %{state | set_task: nil}
      else
        state
      end

    {:noreply, new_state}
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

  def delayed_start(scheduler, time) do
    GenServer.cast(scheduler, {:delayed_start, time})
  end

  def start_timer(scheduler, delay) do
    Process.send_after(scheduler, :sync, delay)
  end

  def stop_timer(scheduler) do
    GenServer.cast(scheduler, :stop_sync)
  end

  def cancel_set(scheduler) do
    GenServer.cast(scheduler, :cancel_set)
  end

  def cancel_play(scheduler) do
    GenServer.cast(scheduler, :cancel_play)
  end
end
