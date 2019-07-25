defmodule GrasstubeWeb.Video do
  defstruct id: 0, title: "", type: "default", url: "", sub: "", small: "", duration: :unset
end

defmodule GrasstubeWeb.VideoAgent do
  use Agent
  require Logger

  alias GrasstubeWeb.PlaylistAgent
  alias GrasstubeWeb.Endpoint

  defstruct current_video: :nothing,
            playing: false,
            time_started: :not_started,
            time_seek: 0,
            time_set: 0

  def start_link(_opts) do
    Logger.info("Starting video agent.")
    Agent.start_link(fn -> %__MODULE__{} end, name: __MODULE__)
  end

  def toggle_playing() do
    Agent.update(__MODULE__, fn val ->
      %{
        val
        | playing: !val.playing,
          time_seek: actual_get_time(val),
          time_started: DateTime.to_unix(DateTime.utc_now())
      }
    end)
    Endpoint.broadcast("video:0", "playing", %{playing: playing?()})
    Endpoint.broadcast("video:0", "seek", %{t: get_time()})
  end

  def set_playing(playing) do
    Agent.update(__MODULE__, fn val ->
      %{ val | playing: playing }
    end)
  end

  def get_time_set() do
    Agent.get(__MODULE__, fn val -> val.time_set end)
  end

  def playing?() do
    Agent.get(__MODULE__, fn val -> val.playing end)
  end

  def get_time() do
    Agent.get(__MODULE__, fn val -> actual_get_time(val) end)
  end

  defp actual_get_time(val) do
    if val.playing and val.time_started != :not_started do
      now = DateTime.to_unix(DateTime.utc_now())
      val.time_seek + now - val.time_started
    else
      val.time_seek
    end
  end

  def set_seek(t) do
    Agent.update(__MODULE__, fn val ->
      %{val | time_seek: t, time_started: DateTime.to_unix(DateTime.utc_now())}
    end)
  end

  def set_time_started(t) do
    Agent.update(__MODULE__, fn val -> %{val | time_started: t} end)
  end

  def set_current_video(next) do
    set_playing(false)

    now = :os.system_time(:millisecond)

    Agent.update(__MODULE__, fn val ->
      %{
        val
        | current_video: next,
          playing: false,
          time_started: :not_started,
          time_seek: 0,
          time_set: now
      }
    end)

    if next == :nothing do
      Endpoint.broadcast("video:0", "playing", %{playing: false})
      Endpoint.broadcast("video:0", "setvid", %{id: -1, type: "default", url: "", sub: "", small: ""})
      Endpoint.broadcast("playlist:0", "current", %{id: -1})
    else
      Endpoint.broadcast("video:0", "setvid", %{
        id: next.id,
        type: next.type,
        url: next.url,
        sub: next.sub,
        small: next.small
      })
      Endpoint.broadcast("playlist:0", "current", %{id: next.id})
    end

    now
  end

  def get_current_video() do
    Agent.get(__MODULE__, fn val ->
      val.current_video
    end)
  end

end

defmodule GrasstubeWeb.VideoScheduler do
  use GenServer
  require Logger

  alias GrasstubeWeb.VideoAgent
  alias GrasstubeWeb.PlaylistAgent
  alias GrasstubeWeb.Endpoint

  @time_to_next 5
  @time_to_start 5

  def start_link(_) do
    Logger.info("Starting video scheduler.")
    GenServer.start_link(__MODULE__, :nothing, name: __MODULE__)
  end

  def init(state) do
    Process.send_after(self(), :sync, 2000)
    {:ok, state}
  end

  def delayed_start(time) do
    Process.send_after(__MODULE__, {:delayed_start, time}, @time_to_start * 1000)
  end

  def handle_info({:delayed_start, time}, state) do
    if time == VideoAgent.get_time_set() do
      VideoAgent.set_seek(VideoAgent.get_time())
      VideoAgent.set_playing(true)
      Endpoint.broadcast("video:0", "playing", %{playing: true})
    end
    {:noreply, state}
  end

  def handle_info(:sync, state) do
    current = VideoAgent.get_current_video()

    new_state = if current != :nothing do
      current_time = VideoAgent.get_time()
      Endpoint.broadcast("video:0", "seek", %{t: current_time})
      Endpoint.broadcast("video:0", "playing", %{playing: VideoAgent.playing?()})

      case current.duration do
        :unset ->
          :nothing

        duration ->

          cond do
            current_time - duration > 0 and state != :waiting ->
              Endpoint.broadcast("chat:0", "chat", %{
                id: "sys",
                content: "playing next video in #{@time_to_next + @time_to_start} seconds"
              })

              :waiting

            current_time - duration > @time_to_next ->
              PlaylistAgent.next_video()
              :nothing

            true ->
              state
          end
      end
    else
      :nothing
    end

    Process.send_after(self(), :sync, 2000)
    {:noreply, new_state}
  end
end