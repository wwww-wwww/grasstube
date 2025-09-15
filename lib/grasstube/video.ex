defmodule Grasstube.VideoAgent do
  use Agent

  alias Grasstube.{PlaylistAgent, Room, VideoScheduler}
  alias GrasstubeWeb.Endpoint
  alias Phoenix.PubSub

  defstruct current_video: :nothing,
            playing: false,
            play_on_ready: false,
            time_started: :not_started,
            time_seek: 0,
            room_name: "",
            speed: 1,
            autopaused: false,
            autopause_min: 0

  def start_link(room) do
    Agent.start_link(fn -> %__MODULE__{room_name: room.title} end, name: via_tuple(room.title))
  end

  def via_tuple(room_name), do: Grasstube.ProcessRegistry.via_tuple({room_name, :video})

  defp current_time() do
    DateTime.utc_now()
    |> DateTime.to_unix(:millisecond)
    |> Kernel./(1000)
  end

  def set_playing(pid, playing) do
    case get_current_video(pid) do
      :nothing ->
        nil

      %{ready: false} ->
        set_play_on_ready(pid, true)

      %{ready: true} ->
        set_play_on_ready(pid, false)

        current_state =
          Agent.get_and_update(pid, fn val ->
            if val.playing != playing do
              {val.playing,
               %{
                 val
                 | playing: playing,
                   time_seek: get_time(val),
                   time_started: current_time(),
                   autopaused: false
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

  def get_time(val) when is_map(val) do
    if val.playing and val.time_started != :not_started do
      now = current_time()
      val.time_seek + (now - val.time_started) * val.speed
    else
      val.time_seek
    end
  end

  def get_time(pid), do: Agent.get(pid, &get_time/1)

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
      IO.inspect("broadcast on evideo:#{room_name}")
      PubSub.broadcast(Grasstube.PubSub, "evideo:#{room_name}", :stop)

      Endpoint.broadcast("video:#{room_name}", "setvid", %{
        title: nil,
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
      IO.inspect("broadcast on evideo:#{room_name}")
      PubSub.broadcast(Grasstube.PubSub, "evideo:#{room_name}", {:playing, next.title})

      Endpoint.broadcast("video:#{room_name}", "setvid", %{
        title: next.title,
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
        time: get_time(val),
        playing: val.playing,
        speed: val.speed,
        pid: pid
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
           | time_seek: get_time(val),
             time_started: current_time(),
             speed: speed
         }}
      end)

    Endpoint.broadcast("video:#{room_name}", "sync", %{speed: speed})
  end

  def autopause?(%{room_name: room_name}), do: Room.get_attr(room_name, :autopause, false)
  def autopause?(pid), do: autopause?(Agent.get(pid, & &1))

  def can_autopause?(pid) do
    Agent.get(
      pid,
      &(autopause?(&1) and &1.current_video != :nothing and &1.current_video.type == "default")
    )
  end

  def toggle_autopause(pid) do
    {room_name, autopause} =
      Agent.get(pid, fn %{room_name: room_name} ->
        autopause = not Room.get_attr(room_name, :autopause, false)
        Room.set_attr(room_name, :autopause, autopause)

        {room_name, autopause}
      end)

    Endpoint.broadcast("video:#{room_name}", "autopause", autopause)

    autopause
  end

  def check_autopause(pid) do
    Agent.get_and_update(pid, fn val ->
      if val.current_video != :nothing and val.current_video.type != "yt" and autopause?(val) do
        time = get_time(val)

        playing =
          if val.autopause_min < time and val.current_video.duration - time > 1 do
            false
          else
            val.playing or val.autopaused
          end

        if playing != val.playing do
          {{playing, time},
           %{
             val
             | playing: playing,
               time_seek: time,
               time_started: current_time(),
               autopaused: true
           }}
        else
          {false, val}
        end
      else
        {false, val}
      end
    end)
    |> case do
      false ->
        false

      {playing, time} ->
        room_name = Agent.get(pid, & &1.room_name)

        Grasstube.ProcessRegistry.lookup(room_name, :video_scheduler)
        |> VideoScheduler.cancel_play()

        Endpoint.broadcast("video:#{room_name}", "sync", %{
          t: time,
          playing: playing
        })

        true
    end
  end

  def set_autopause_time(pid, time) do
    Agent.update(pid, &%{&1 | autopause_min: time})
    check_autopause(pid)
  end
end

defmodule Grasstube.VideoScheduler do
  use GenServer

  alias Grasstube.{PlaylistAgent, VideoAgent, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  @time_to_next 5
  @time_to_start 5

  def start_link(room) do
    GenServer.start_link(
      __MODULE__,
      %{
        sync_time: 0,
        room_name: room.title,
        sync_task: :nothing,
        set_task: :nothing,
        play_task: :nothing
      },
      name: via_tuple(room.title)
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

        %{pid: pid, video: video, time: time, playing: playing, speed: speed} ->
          if video.duration == nil do
            %{state | sync_task: :nothing}
          else
            scheduler = ProcessRegistry.lookup(state.room_name, :video_scheduler)

            if !VideoAgent.check_autopause(pid) do
              Endpoint.broadcast("video:#{state.room_name}", "sync", %{
                t: time,
                playing: playing,
                speed: speed
              })

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
