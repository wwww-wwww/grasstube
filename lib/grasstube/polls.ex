defmodule GrasstubeWeb.PollsAgent do
  use Agent
  require Logger

  defstruct polls: %{},
            current_id: 0

  def start_link(_opts) do
    Logger.info("Starting polls agent.")
    Agent.start_link(fn -> %__MODULE__{} end, name: __MODULE__)
  end

  def add_poll(title, choices) do
    Agent.update(__MODULE__, fn val ->
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

  def remove_poll(id) do
    Agent.update(__MODULE__, fn val ->
      new_polls = Map.drop(val.polls, [id])
      %{val | polls: new_polls}
    end)
  end

  def get_polls() do
    Agent.get(__MODULE__, fn val ->
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

  def set_vote(user_id, poll_id, choice) do
    Agent.update(__MODULE__, fn val ->
      new_polls = put_in(val.polls, [poll_id, :votes, user_id], choice)
      %{val | polls: new_polls}
    end)
  end

  def remove_vote(user_id) do
    Agent.update(__MODULE__, fn val ->
      new_polls = val.polls |> Map.new(fn {k, poll} ->
        new_poll = %{poll | votes: Map.drop(poll.votes, [user_id])}
        {k, new_poll}
      end)
      %{val | polls: new_polls}
    end)
  end
end
