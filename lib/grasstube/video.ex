defmodule Grasstube.Video do
  defstruct id: 0,
            title: "",
            type: "default",
            url: "",
            sub: "",
            alts: %{},
            duration: :unset,
            ready: false
end

defmodule Grasstube.VideoAgent do
  use Agent
  require Logger

  alias Grasstube.{PlaylistAgent, VideoScheduler}
  alias GrasstubeWeb.Endpoint

  defstruct current_video: :nothing,
            playing: false,
            play_on_ready: false,
            time_started: :not_started,
            time_seek: 0,
            room_name: ""

  def start_link(room_name) do
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :video})
  end

  def set_playing(pid, playing) do
    if not get_current_video(pid).ready do
      set_play_on_ready(pid, true)
    else
      set_play_on_ready(pid, false)

      Agent.update(pid, fn val ->
        %{
          val
          | playing: playing,
            time_seek: actual_get_time(val),
            time_started: DateTime.to_unix(DateTime.utc_now())
        }
      end)

      room_name = Agent.get(pid, fn val -> val.room_name end)

      Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)
      |> VideoScheduler.cancel_play()

      Endpoint.broadcast("video:" <> room_name, "playing", %{playing: playing?(pid)})
      Endpoint.broadcast("video:" <> room_name, "time", %{t: get_time(pid)})
    end
  end

  def playing?(pid) do
    Agent.get(pid, fn val -> val.playing end)
  end

  def get_time(pid) do
    Agent.get(pid, fn val -> actual_get_time(val) end)
  end

  defp actual_get_time(val) do
    if val.playing and val.time_started != :not_started do
      now = DateTime.to_unix(DateTime.utc_now())
      val.time_seek + now - val.time_started
    else
      val.time_seek
    end
  end

  def set_seek(pid, t) do
    Agent.update(pid, fn val ->
      %{val | time_seek: t, time_started: DateTime.to_unix(DateTime.utc_now())}
    end)
  end

  def set_time_started(pid, t) do
    Agent.update(pid, fn val -> %{val | time_started: t} end)
  end

  def set_current_video(pid, next) do
    Agent.update(pid, fn val ->
      %{
        val
        | current_video: next,
          playing: false,
          time_started: :not_started,
          time_seek: 0
      }
    end)

    room_name = Agent.get(pid, fn val -> val.room_name end)

    scheduler = Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)

    VideoScheduler.cancel_set(scheduler)
    VideoScheduler.cancel_play(scheduler)

    Endpoint.broadcast("video:" <> room_name, "playing", %{playing: false})

    if next == :nothing do
      Endpoint.broadcast("video:" <> room_name, "setvid", %{
        id: -1,
        type: "default",
        url: "",
        sub: "",
        alts: %{},
        duration: 0
      })

      Endpoint.broadcast("playlist:" <> room_name, "current", %{id: -1})
      VideoScheduler.stop_timer(scheduler)
    else
      Endpoint.broadcast("video:" <> room_name, "setvid", %{
        id: next.id,
        type: next.type,
        url: next.url,
        sub: next.sub,
        alts: next.alts,
        duration: next.duration
      })

      Endpoint.broadcast("playlist:" <> room_name, "current", %{id: next.id})
      VideoScheduler.start_timer(scheduler, 0)
    end
  end

  def get_status(pid) do
    Agent.get(pid, fn val ->
      {val.current_video, actual_get_time(val), val.playing}
    end)
  end

  def get_current_video(pid) do
    Agent.get(pid, fn val ->
      val.current_video
    end)
  end

  def set_play_on_ready(pid, b) do
    Agent.update(pid, fn val ->
      %{val | play_on_ready: b}
    end)
  end

  def play_on_ready?(pid) do
    Agent.get(pid, fn val ->
      val.play_on_ready
    end)
  end
end

defmodule Grasstube.VideoScheduler do
  use GenServer
  require Logger

  alias Grasstube.{PlaylistAgent, VideoAgent, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  @time_to_next 5
  @time_to_start 5

  def start_link(room_name) do
    GenServer.start_link(
      __MODULE__,
      %{
        sync_time: 0,
        room_name: room_name,
        sync_task: :nothing,
        set_task: :nothing,
        play_task: :nothing
      },
      name: via_tuple(room_name)
    )
  end

  def via_tuple(room_name) do
    ProcessRegistry.via_tuple({room_name, :video_scheduler})
  end

  def init(state) do
    {:ok, state}
  end

  def handle_info(:delayed_start, state) do
    if state.play_task != :nothing do
      Process.cancel_timer(state.play_task)
    end

    video = ProcessRegistry.lookup(state.room_name, :video)

    VideoAgent.set_seek(video, VideoAgent.get_time(video))
    VideoAgent.set_playing(video, true)
    start_timer(self(), 0)
    Endpoint.broadcast("video:" <> state.room_name, "playing", %{playing: true})

    {:noreply, %{state | play_task: :nothing}}
  end

  def handle_info({:delayed_set, playlist}, state) do
    PlaylistAgent.next_video(playlist)
    {:noreply, state}
  end

  def handle_info(:sync, state) do
    if state.sync_task != :nothing do
      Process.cancel_timer(state.sync_task)
    end

    new_state =
      ProcessRegistry.lookup(state.room_name, :video)
      |> VideoAgent.get_status()
      |> case do
        {:nothing, _, _} ->
          state

        {current, time, playing} ->
          Endpoint.broadcast("video:" <> state.room_name, "time", %{t: time})

          Endpoint.broadcast("video:" <> state.room_name, "playing", %{
            playing: playing
          })

          if current.duration == :unset do
            %{state | sync_task: :nothing}
          else
            scheduler = ProcessRegistry.lookup(state.room_name, :video_scheduler)

            if time - current.duration > 0 do
              Endpoint.broadcast("chat:" <> state.room_name, "chat", %{
                sender: "sys",
                name: "System",
                content: "playing next video in #{@time_to_next + @time_to_start} seconds"
              })

              playlist = ProcessRegistry.lookup(state.room_name, :playlist)

              %{
                state
                | set_task: Process.send_after(scheduler, {:delayed_set, playlist}, 5000),
                  sync_task: :nothing
              }
            else
              %{state | sync_task: start_timer(scheduler, 2000)}
            end
          end
      end

    {:noreply, new_state}
  end

  def handle_cast({:delayed_start, time}, state) do
    new_state = %{state | play_task: Process.send_after(self(), :delayed_start, time)}
    {:noreply, new_state}
  end

  def handle_cast(:cancel_play, state) do
    new_state =
      if state.play_task != :nothing do
        Process.cancel_timer(state.play_task)
        %{state | play_task: :nothing}
      else
        state
      end

    {:noreply, new_state}
  end

  def handle_cast(:cancel_set, state) do
    new_state =
      if state.set_task != :nothing do
        Process.cancel_timer(state.set_task)
        %{state | set_task: :nothing}
      else
        state
      end

    {:noreply, new_state}
  end

  def handle_cast(:stop_sync, state) do
    new_state =
      if state.sync_task != :nothing do
        Process.cancel_timer(state.sync_task)
        %{state | sync_task: :nothing}
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
