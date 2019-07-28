defmodule GrasstubeWeb.PollsChannel do
  use Phoenix.Channel
  require Logger

	alias GrasstubeWeb.Endpoint
	alias GrasstubeWeb.PollsAgent
	alias GrasstubeWeb.ChatAgent

	def join("polls:" <> room_name, _message, socket) do
    case Grasstube.ProcessRegistry.lookup(room_name, :polls) do
      :not_found ->
        {:error, "no room"}
      
      _channel ->
        send(self(), {:after_join, nil})
        :ok = ChannelWatcher.monitor(:rooms, self(), {__MODULE__, :leave, [socket.id, socket.topic]})
        {:ok, socket}
    end
  end
  
  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end

  def handle_info({:after_join, _}, socket) do
    IO.inspect(socket.topic)
    "polls:" <> room_name = socket.topic
    polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

		push(socket, "id", %{id: socket.id})
		push(socket, "polls", PollsAgent.get_polls(polls))
		{:noreply, socket}
  end
  
  def handle_info({ref, _}, socket) do
    Process.demonitor(ref, [:flush])
    {:noreply, socket}
  end

  def leave(user_id, topic) do
    "polls:" <> room_name = topic
    polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

    PollsAgent.remove_vote(polls, user_id)
    Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
  end

	def handle_in("poll_add", %{"title" => title, "choices" => choices}, socket) do
    "polls:" <> room_name = socket.topic
    
		if ChatAgent.mod?(room_name, socket.id) do
      polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)
      PollsAgent.add_poll(polls, title, choices)
      Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
		end
		{:noreply, socket}
	end

	def handle_in("poll_remove", %{"id" => poll_id}, socket) do
    "polls:" <> room_name = socket.topic

		if ChatAgent.mod?(room_name, socket.id) do
      polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)
      PollsAgent.remove_poll(polls, poll_id)
      Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
		end
		{:noreply, socket}
	end

	def handle_in("poll_vote", %{"id" => poll_id, "choice" => choice}, socket) do
    "polls:" <> room_name = socket.topic
    polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

		PollsAgent.set_vote(polls, socket.id, poll_id, choice)
		Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
		{:noreply, socket}
	end
end
