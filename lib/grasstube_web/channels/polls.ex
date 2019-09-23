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
        :ok = ChannelWatcher.monitor(:rooms, self(), {__MODULE__, :leave, [socket, socket.topic]})
        {:ok, socket}
    end
  end
  
  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end

  def handle_info({:after_join, _}, socket) do
    "polls:" <> room_name = socket.topic

    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if ChatAgent.room_mod?(room_name, user) do
        push(socket, "controls", %{})
      end
      push(socket, "username", %{username: user.username})
    else
      push(socket, "id", %{id: socket.id})
    end

    polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

		push(socket, "polls", PollsAgent.get_polls(polls))
		{:noreply, socket}
  end
  
  def handle_info({ref, _}, socket) do
    Process.demonitor(ref, [:flush])
    {:noreply, socket}
  end

  def leave(socket, topic) do
    "polls:" <> room_name = topic
    polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

    if not Guardian.Phoenix.Socket.authenticated?(socket) do
      PollsAgent.remove_vote(polls, socket.id)
      Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
    end
  end

	def handle_in("poll_add", %{"title" => title, "choices" => choices}, socket) do
    "polls:" <> room_name = socket.topic
    
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if ChatAgent.room_mod?(room_name, user) do
        polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)
        PollsAgent.add_poll(polls, title, choices)
        Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
      end
		end
		{:noreply, socket}
	end

	def handle_in("poll_remove", %{"id" => poll_id}, socket) do
    "polls:" <> room_name = socket.topic

    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if ChatAgent.room_mod?(room_name, user) do
        polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)
        PollsAgent.remove_poll(polls, poll_id)
        Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
      end
		end
		{:noreply, socket}
	end

	def handle_in("poll_vote", %{"id" => poll_id, "choice" => choice}, socket) do
    "polls:" <> room_name = socket.topic
    polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket).username
      PollsAgent.set_vote(polls, poll_id, user, false, choice)
    else
      PollsAgent.set_vote(polls, poll_id, socket.id, true, choice)
    end
		Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
		{:noreply, socket}
	end
end
