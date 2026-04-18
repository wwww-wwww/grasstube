defmodule Grasstube.ChatAgent do
  use Agent
  use GrasstubeWeb, :html

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{ProcessRegistry, Repo, Room}

  require AutoLinker

  defstruct room_id: nil,
            history: [],
            last_ready: nil,
            ready_members: %{},
            emotes: []

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
        case Enum.find(emotes, &(String.downcase(emote) == ":" <> &1.name <> ":")) do
          nil ->
            parse_emote(":" <> tail, acc <> before <> String.slice(emote, 0..-2), emotes)

          %{id: id, name: name} ->
            assigns = %{id: id}

            emote_html =
              ~H"""
              <img src={~p"/emotes/#{to_string(id) <> ".png"}"} alt={name} title={name} />
              """
              |> Phoenix.HTML.Safe.to_iodata()
              |> IO.iodata_to_binary()

            parse_emote(tail, acc <> before <> emote_html, emotes)
        end
    end
  end

  def chat(pid, user, message, fun_reply) do
    if String.length(String.trim(message)) > 0 do
      opts = %{notify: true, effect: "bullet"}

      state = get(pid)
      emotes = state.emotes

      message = parse_emote(message, "", emotes)

      message = %{
        time: DateTime.utc_now(),
        sender: sender(user.username),
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

  def chat(_, _, _, _), do: nil

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
