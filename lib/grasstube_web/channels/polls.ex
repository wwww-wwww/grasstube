defmodule GrasstubeWeb.PollsChannel do
  use Phoenix.Channel
  require Logger

	alias GrasstubeWeb.Endpoint
	alias GrasstubeWeb.PollsAgent
	alias GrasstubeWeb.ChatAgent

	def join("polls:0", _message, socket) do
		send(self(), {:after_join, nil})
    :ok = ChannelWatcher.monitor(:rooms, self(), {__MODULE__, :leave, [socket.id]})
		{:ok, socket}
  end
  
  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end

	def handle_info({:after_join, _}, socket) do
		push(socket, "id", %{id: socket.id})
		push(socket, "polls", PollsAgent.get_polls())
		{:noreply, socket}
  end
  
  def handle_info({ref, _}, socket) do
    Process.demonitor(ref, [:flush])
    {:noreply, socket}
  end

  def leave(user_id) do
    PollsAgent.remove_vote(user_id)
    Endpoint.broadcast("polls:0", "polls", PollsAgent.get_polls())
  end

	def handle_in("poll_add", %{"title" => title, "choices" => choices}, socket) do
		if ChatAgent.mod?(socket.id) do
      PollsAgent.add_poll(title, choices)
      Endpoint.broadcast("polls:0", "polls", PollsAgent.get_polls())
		end
		{:noreply, socket}
	end

	def handle_in("poll_remove", %{"id" => poll_id}, socket) do
		if ChatAgent.mod?(socket.id) do
      PollsAgent.remove_poll(poll_id)
      Endpoint.broadcast("polls:0", "polls", PollsAgent.get_polls())
		end
		{:noreply, socket}
	end

	def handle_in("poll_vote", %{"id" => poll_id, "choice" => choice}, socket) do
		PollsAgent.set_vote(socket.id, poll_id, choice)
		Endpoint.broadcast("polls:0", "polls", PollsAgent.get_polls())
		{:noreply, socket}
	end
end
