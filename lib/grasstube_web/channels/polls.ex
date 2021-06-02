defmodule GrasstubeWeb.PollsChannel do
  use Phoenix.Channel

  alias Grasstube.Presence
  alias GrasstubeWeb.{Endpoint, PollsAgent, ChatAgent}

  def join("polls:" <> room_name, %{"password" => password}, socket) do
    case Grasstube.ProcessRegistry.lookup(room_name, :polls) do
      :not_found ->
        {:error, "no room"}

      _ ->
        case ChatAgent.auth(socket, room_name, password) do
          {:ok, socket} ->
            if not String.starts_with?(socket.assigns.user_id, "$") do
              :ok = GrasstubeWeb.Endpoint.subscribe("user:#{room_name}:#{socket.assigns.user_id}")
            end

            send(self(), {:after_join, nil})
            {:ok, socket}

          resp ->
            resp
        end
    end
  end

  def handle_info({:after_join, _}, socket) do
    "polls:" <> room_name = socket.topic

    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    if ChatAgent.controls?(chat, socket) do
      push(socket, "controls", %{})
    end

    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)

      push(socket, "username", %{username: user.username})
    else
      push(socket, "id", %{id: socket.id})
    end

    Presence.track(socket, socket.assigns.user_id, %{})

    polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

    push(socket, "polls", PollsAgent.get_polls(polls))
    {:noreply, socket}
  end

  def handle_info(
        %Phoenix.Socket.Broadcast{topic: "user:" <> _, event: ev, payload: payload},
        socket
      ) do
    push(socket, ev, payload)
    {:noreply, socket}
  end

  def terminate(_, socket) do
    Presence.untrack(socket, socket.assigns.user_id)
    presence = Presence.list(socket)

    if not Map.has_key?(presence, socket.assigns.user_id) do
      "polls:" <> room_name = socket.topic
      polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)

      if not Guardian.Phoenix.Socket.authenticated?(socket) do
        PollsAgent.remove_vote(polls, socket.id)
        Endpoint.broadcast(socket.topic, "polls", PollsAgent.get_polls(polls))
      end
    end
  end

  def handle_in("poll_add", %{"title" => title, "choices" => choices}, socket) do
    "polls:" <> room_name = socket.topic

    Grasstube.ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)
      PollsAgent.add_poll(polls, title, choices)
      Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
    end

    {:noreply, socket}
  end

  def handle_in("poll_remove", %{"id" => poll_id}, socket) do
    "polls:" <> room_name = socket.topic

    Grasstube.ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      polls = Grasstube.ProcessRegistry.lookup(room_name, :polls)
      PollsAgent.remove_poll(polls, poll_id)
      Endpoint.broadcast("polls:" <> room_name, "polls", PollsAgent.get_polls(polls))
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
