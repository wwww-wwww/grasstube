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
            room_name: "",
            speed: 1,
            autopaused: false,
            autopause: false

  def start_link(room_name) do
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name), do: Grasstube.ProcessRegistry.via_tuple({room_name, :video})

  def current_time() do
    DateTime.utc_now()
    |> DateTime.to_unix(:millisecond)
    |> Kernel./(1000)
  end

  def set_playing(pid, playing, autopaused \\ false) do
    if not get_current_video(pid).ready do
      set_play_on_ready(pid, true)
    else
      set_play_on_ready(pid, false)

      current_state =
        Agent.get_and_update(pid, fn val ->
          if val.playing != playing do
            {val.playing,
             %{
               val
               | playing: playing,
                 time_seek: actual_get_time(val),
                 time_started: current_time(),
                 autopaused: autopaused
             }}
          else
            {val.playing, val}
          end
        end)

      if current_state != playing do
        room_name = Agent.get(pid, & &1.room_name)

        Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)
        |> VideoScheduler.cancel_play()

        Endpoint.broadcast("video:#{room_name}", "sync", %{
          t: get_time(pid),
          playing: playing?(pid)
        })
      end
    end

    pid
  end

  def playing?(pid), do: Agent.get(pid, & &1.playing)

  def get_time(pid), do: Agent.get(pid, &actual_get_time/1)

  def remaining_time(pid),
    do:
      Agent.get(pid, fn val ->
        case val.current_video do
          %{duration: :unset} -> 0
          %{duration: n} -> n - actual_get_time(val)
          _ -> 0
        end
      end)

  defp actual_get_time(val) do
    if val.playing and val.time_started != :not_started do
      now = current_time()
      val.time_seek + (now - val.time_started) * val.speed
    else
      val.time_seek
    end
  end

  def seek_shift(pid, t) do
    {new_time, room_name} =
      Agent.get_and_update(pid, fn val ->
        {
          {val.time_seek + t, val.room_name},
          %{val | time_seek: val.time_seek + t, time_started: current_time()}
        }
      end)

    Endpoint.broadcast("video:#{room_name}", "seek", %{t: new_time})
    pid
  end

  def set_seek(pid, t) do
    Agent.update(pid, &%{&1 | time_seek: t, time_started: current_time()})
    room_name = Agent.get(pid, & &1.room_name)
    Endpoint.broadcast("video:#{room_name}", "seek", %{t: t})
    pid
  end

  def set_time_started(pid, t), do: Agent.update(pid, &%{&1 | time_started: t})

  def set_current_video(pid, next) do
    room_name =
      Agent.get_and_update(pid, fn val ->
        {val.room_name,
         %{
           val
           | current_video: next,
             playing: false,
             time_started: :not_started,
             time_seek: 0,
             autopaused: false
         }}
      end)

    scheduler = Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)

    VideoScheduler.cancel_set(scheduler)
    VideoScheduler.cancel_play(scheduler)

    Endpoint.broadcast("video:#{room_name}", "sync", %{playing: false})

    if next == :nothing do
      Endpoint.broadcast("video:#{room_name}", "setvid", %{
        id: -1,
        type: "default",
        url: "",
        sub: "",
        alts: %{},
        duration: 0
      })

      Endpoint.broadcast("playlist:#{room_name}", "current", %{id: -1})
      VideoScheduler.stop_timer(scheduler)
    else
      Endpoint.broadcast("video:#{room_name}", "setvid", %{
        id: next.id,
        type: next.type,
        url: next.url,
        sub: next.sub,
        alts: next.alts,
        duration: next.duration
      })

      Endpoint.broadcast("playlist:#{room_name}", "current", %{id: next.id})
      VideoScheduler.start_timer(scheduler, 0)
    end
  end

  def get_status(pid) do
    Agent.get(pid, fn val ->
      %{
        video: val.current_video,
        time: actual_get_time(val),
        playing: val.playing,
        speed: val.speed
      }
    end)
  end

  def get_current_video(pid), do: Agent.get(pid, & &1.current_video)

  def set_play_on_ready(pid, b), do: Agent.update(pid, &%{&1 | play_on_ready: b})

  def play_on_ready?(pid), do: Agent.get(pid, & &1.play_on_ready)

  def set_speed(pid, speed) do
    room_name =
      Agent.get_and_update(pid, fn val ->
        {val.room_name,
         %{
           val
           | time_seek: actual_get_time(val),
             time_started: current_time(),
             speed: speed
         }}
      end)

    Endpoint.broadcast("video:#{room_name}", "sync", %{speed: speed})
  end

  def autopaused?(pid), do: Agent.get(pid, & &1.autopaused)

  def autopause?(pid), do: Agent.get(pid, & &1.autopause)

  def can_autopause?(pid) do
    Agent.get(
      pid,
      &(&1.autopause and &1.current_video != :nothing and &1.current_video.type == "default")
    )
  end

  def toggle_autopause(pid) do
    {room_name, autopause} =
      Agent.get_and_update(
        pid,
        &{{&1.room_name, not &1.autopause}, %{&1 | autopause: not &1.autopause}}
      )

    Endpoint.broadcast("video:#{room_name}", "autopause", autopause)

    autopause
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

  def via_tuple(room_name), do: ProcessRegistry.via_tuple({room_name, :video_scheduler})

  def init(state) do
    {:ok, state}
  end

  def handle_info(:delayed_start, state) do
    if state.play_task != :nothing do
      Process.cancel_timer(state.play_task)
    end

    ProcessRegistry.lookup(state.room_name, :video)
    |> VideoAgent.seek_shift(0)
    |> VideoAgent.set_playing(true)

    start_timer(self(), 0)
    Endpoint.broadcast("video:#{state.room_name}", "sync", %{playing: true, t: 0})

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
        %{video: :nothing} ->
          state

        %{video: video, time: time, playing: playing, speed: speed} ->
          Endpoint.broadcast("video:#{state.room_name}", "sync", %{
            t: time,
            playing: playing,
            speed: speed
          })

          if video.duration == :unset do
            %{state | sync_task: :nothing}
          else
            scheduler = ProcessRegistry.lookup(state.room_name, :video_scheduler)

            if time - video.duration > 0 do
              Endpoint.broadcast("chat:#{state.room_name}", "chat", %{
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
    {:noreply, %{state | play_task: Process.send_after(self(), :delayed_start, time)}}
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
