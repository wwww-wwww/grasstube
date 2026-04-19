defmodule Grasstube.ChatAgent do
  use Agent
  use GrasstubeWeb, :html

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{Repo, ProcessRegistry, Room, Presence, VideoAgent}

  require AutoLinker

  defstruct room_id: nil,
            history: [],
            last_ready: nil,
            ready_members: %{},
            emotes: [],
            ready_check_last: 0,
            ready_check_members: [],
            ready_check_task: nil

  defmodule ChatMessage do
    @derive Jason.Encoder
    defstruct sender: "sys", name: "System", content: "", extra_data: nil
  end

  @command_prefix "/"
  @max_message_size 250
  @max_history_size 20
  @max_name_length 24

  def start_link(room) do
    Agent.start_link(
      fn ->
        room = Repo.get(Room, room.id) |> Repo.preload(user: :emotes)
        emotes = room.user.emotes
        %__MODULE__{room_id: room.id, emotes: emotes}
      end,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def get(pid), do: Agent.get(pid, & &1)

  def update_emotes(pid, emotes) do
    Agent.update(pid, fn state -> %{state | emotes: emotes} end)
  end

  def parse_emote(message, acc, emotes) do
    case Regex.split(~r{(:[^:]+:)}, message, include_captures: true, parts: 2) do
      [_] ->
        acc <> message

      [before | [emote | [tail]]] ->
        with %{id: id, name: name} <-
               Enum.find(emotes, &(String.downcase(emote) == ":" <> &1.name <> ":")) do
          assigns = %{id: id, name: name}

          emote_html =
            ~H"""
            <img src={~p"/emotes/#{to_string(@id) <> ".png"}"} alt={@name} title={@name} />
            """
            |> Phoenix.HTML.Safe.to_iodata()
            |> IO.iodata_to_binary()

          parse_emote(tail, acc <> before <> emote_html, emotes)
        else
          _ -> parse_emote(":" <> tail, acc <> before <> String.slice(emote, 0..-2//-1), emotes)
        end
    end
  end

  def chat(pid, scope, "/ready", fun_reply) do
    time =
      DateTime.utc_now()
      |> DateTime.to_unix(:millisecond)

    Agent.get_and_update(pid, fn state ->
      total =
        Presence.list("room:#{state.room_id}")
        |> Map.to_list()
        |> length()

      if time - state.ready_check_last > 5000 do
        members = [scope.id]

        task =
          Task.Supervisor.async_nolink(Tasks, fn ->
            Process.sleep(10000)
            Endpoint.broadcast("video:#{state.room_id}", "ready_fail", %{})
          end)

        Process.demonitor(task.ref)

        {{state.room_id, members, total},
         %{
           state
           | ready_check_last: time,
             ready_check_members: members,
             ready_check_task: task
         }}
      else
        members = (state.ready_check_members ++ [scope.id]) |> Enum.uniq()

        if total == length(members) do
          if state.ready_check_task do
            Task.shutdown(state.ready_check_task)
          end

          {{state.room_id, :finish},
           %{
             state
             | ready_check_last: 0,
               ready_check_members: members,
               ready_check_task: nil
           }}
        else
          {{state.room_id, members, total}, %{state | ready_check_members: members}}
        end
      end
    end)
    |> case do
      {room_id, :finish} ->
        Endpoint.broadcast("video:#{room_id}", "ready_finish", %{})

        ProcessRegistry.lookup(room_id, VideoAgent)
        |> VideoAgent.set_playing(true)

      {room_id, members, total} ->
        Endpoint.broadcast("video:#{room_id}", "ready", %{
          members: members,
          total: total
        })

      _ ->
        nil
    end
  end

  def chat(pid, scope, message, fun_reply) do
    if String.length(String.trim(message)) > 0 do
      opts = %{notify: true, effect: "bullet"}

      state = get(pid)
      emotes = state.emotes

      message = parse_emote(message, "", emotes)

      username =
        case scope do
          %{user: %{username: username}} -> username
          %{guest: id} -> "guest #{id}"
        end

      message = %{
        time: DateTime.utc_now(),
        sender: sender(username),
        html: basic_message(raw(message)),
        opts: opts
      }

      Agent.update(pid, fn state ->
        new_history =
          ([message] ++ state.history)
          |> Enum.take(20)

        %{state | history: new_history}
      end)

      Endpoint.broadcast("chat:#{state.room_id}", "message", message)
    end
  end

  def sender(sender) do
    assigns = %{sender: sender}

    ~H"""
    {@sender}
    """
    |> Phoenix.HTML.Safe.to_iodata()
    |> IO.iodata_to_binary()
  end

  def basic_message(message) do
    assigns = %{message: message}

    ~H"""
    <span>{@message}</span>
    """
    |> Phoenix.HTML.Safe.to_iodata()
    |> IO.iodata_to_binary()
  end

  def broadcast_to(message, sender, room_id, opts \\ %{}) do
    Endpoint.broadcast("chat:#{room_id}", "message", %{
      sender: sender(sender),
      html: message,
      opts: opts
    })
  end

  def clear(pid) do
    state =
      Agent.get_and_update(pid, fn state ->
        new_state = %{state | history: []}
        {new_state, new_state}
      end)

    Endpoint.broadcast("chat:#{state.room_id}", "clear", nil)
  end
end
