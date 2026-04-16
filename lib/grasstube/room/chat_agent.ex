defmodule Grasstube.ChatAgent do
  use Agent

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

  def chat(pid, user, message) do
    message = %{sender: user.username, message: message}

    state =
      Agent.get_and_update(pid, fn state ->
        new_history = state.history ++ [message]
        new_state = %{state | history: new_history}
        {new_state, new_state}
      end)

    Endpoint.broadcast("chat:#{state.room_id}", "message", message)
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
