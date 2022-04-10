defmodule Grasstube.PollsAgent do
  use Agent
  require Logger

  alias GrasstubeWeb.Endpoint

  defstruct polls: %{},
            current_id: 0,
            room_name: ""

  def start_link(room_name) do
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name), do: Grasstube.ProcessRegistry.via_tuple({room_name, :polls})

  def get_polls(pid) do
    Agent.get(pid, fn val ->
      val.polls
      |> Enum.map(fn {id, poll} ->
        choices =
          poll.choices
          |> Enum.map(fn choice ->
            users =
              (Enum.to_list(poll.votes) ++ Enum.to_list(poll.votes_guest))
              |> Enum.filter(&(elem(&1, 1) == choice))
              |> Map.new()
              |> Map.keys()

            %{name: choice, users: users}
          end)

        {id, %{title: poll.title, choices: choices}}
      end)
      |> Map.new()
    end)
  end

  def update(pid) do
    room_name = Agent.get(pid, & &1.room_name)
    Endpoint.broadcast("polls:#{room_name}", "polls", get_polls(pid))
  end

  def add_poll(pid, title, choices) do
    Agent.update(pid, fn val ->
      new_polls =
        Map.put(val.polls, Integer.to_string(val.current_id), %{
          id: Integer.to_string(val.current_id),
          title: title,
          choices: choices,
          votes: %{},
          votes_guest: %{}
        })

      %{val | polls: new_polls, current_id: val.current_id + 1}
    end)

    update(pid)
  end

  def remove_poll(pid, id) do
    Agent.update(pid, &%{&1 | polls: Map.drop(&1.polls, [id])})

    update(pid)
  end

  def set_vote(pid, poll_id, user, guest, choice) do
    Agent.update(pid, fn val ->
      new_polls =
        if guest do
          put_in(val.polls, [poll_id, :votes_guest, user], choice)
        else
          put_in(val.polls, [poll_id, :votes, user], choice)
        end

      %{val | polls: new_polls}
    end)

    update(pid)
  end

  def remove_vote(pid, guest_id) do
    Agent.update(pid, fn val ->
      new_polls =
        val.polls
        |> Map.new(fn {k, poll} ->
          {k, %{poll | votes_guest: Map.drop(poll.votes_guest, [guest_id])}}
        end)

      %{val | polls: new_polls}
    end)

    update(pid)
  end
end
