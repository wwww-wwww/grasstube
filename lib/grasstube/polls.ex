defmodule GrasstubeWeb.PollsAgent do
  use Agent
  require Logger

  defstruct polls: %{},
            current_id: 0,
            room_name: ""

  def start_link(opts) do
    Logger.info("Starting polls agent.")
    [room_name: room_name] ++ _ = opts
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :polls})
  end

  def add_poll(pid, title, choices) do
    Agent.update(pid, fn val ->
      new_polls = 
        Map.put(val.polls, Integer.to_string(val.current_id), %{
          id: Integer.to_string(val.current_id),
          title: title,
          choices: choices,
          votes: %{}
        })
      %{val | polls: new_polls, current_id: val.current_id + 1}
    end)
  end

  def remove_poll(pid, id) do
    Agent.update(pid, fn val ->
      new_polls = Map.drop(val.polls, [id])
      %{val | polls: new_polls}
    end)
  end

  def get_polls(pid) do
    Agent.get(pid, fn val ->
      val.polls
      |> Enum.map(fn {id, poll} ->
          choices = poll.choices |> Enum.map(fn choice ->
            users = poll.votes |> Enum.filter( fn {_, vote} -> vote == choice end) |> Map.new |> Map.keys
            %{name: choice, users: users}
          end)
          
          {id, %{title: poll.title, choices: choices}}
        end)
      |> Map.new
    end)
  end

  def set_vote(pid, user_id, poll_id, choice) do
    Agent.update(pid, fn val ->
      new_polls = put_in(val.polls, [poll_id, :votes, user_id], choice)
      %{val | polls: new_polls}
    end)
  end

  def remove_vote(pid, user_id) do
    Agent.update(pid, fn val ->
      new_polls = val.polls |> Map.new(fn {k, poll} ->
        new_poll = %{poll | votes: Map.drop(poll.votes, [user_id])}
        {k, new_poll}
      end)
      %{val | polls: new_polls}
    end)
  end
end
