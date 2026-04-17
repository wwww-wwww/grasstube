defmodule Grasstube.ChatAgent do
  use Agent
  use GrasstubeWeb, :html

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{ProcessRegistry, Repo, Room}

  # require AutoLinker

  defstruct room_id: nil,
            history: [],
            last_ready: nil,
            ready_members: %{}

  defmodule ChatMessage do
    @derive Jason.Encoder
    defstruct sender: "sys", name: "System", content: "", extra_data: nil
  end

  @command_prefix "/"
  @max_message_size 250
  @max_history_size 20
  @max_name_length 24

  def start_link(room) do
    Agent.start_link(fn -> %__MODULE__{room_id: room.id} end,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def get(pid), do: Agent.get(pid, & &1)

  def chat(pid, user, message, fun_reply) do
    if String.length(String.trim(message)) > 0 do
      opts = %{notify: true, effect: "bullet"}
      message = %{sender: sender(user.username), html: basic_message(message), opts: opts}

      state =
        Agent.get_and_update(pid, fn state ->
          new_history = state.history ++ [message]
          new_state = %{state | history: new_history}
          {new_state, new_state}
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
