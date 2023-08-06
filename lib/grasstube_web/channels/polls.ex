defmodule GrasstubeWeb.PollsChannel do
  use Phoenix.Channel

  alias Grasstube.{Presence, PollsAgent, ChatAgent, ProcessRegistry}

  def join("polls:" <> room_name, %{"password" => password}, socket) do
    case ProcessRegistry.lookup(room_name, :polls) do
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

  def join(topic, %{}, socket), do: join(topic, %{"password" => ""}, socket)

  def handle_info({:after_join, _}, socket) do
    "polls:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      push(socket, "controls", %{})
    end

    if socket.assigns.user != nil do
      push(socket, "username", %{username: socket.assigns.user.username})
    else
      push(socket, "id", %{id: socket.id})
    end

    Presence.track(socket, socket.assigns.user_id, %{})

    polls = ProcessRegistry.lookup(room_name, :polls)

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

      ProcessRegistry.lookup(room_name, :polls)
      |> PollsAgent.remove_vote(socket.id)
    end
  end

  def handle_in("poll_add", %{"title" => title, "choices" => choices}, socket) do
    "polls:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      ProcessRegistry.lookup(room_name, :polls)
      |> PollsAgent.add_poll(title, choices)
    end

    {:noreply, socket}
  end

  def handle_in("poll_remove", %{"id" => poll_id}, socket) do
    "polls:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      ProcessRegistry.lookup(room_name, :polls)
      |> PollsAgent.remove_poll(poll_id)
    end

    {:noreply, socket}
  end

  def handle_in("poll_vote", %{"id" => poll_id, "choice" => choice}, socket) do
    "polls:" <> room_name = socket.topic
    polls = ProcessRegistry.lookup(room_name, :polls)

    if socket.assigns.user != nil do
      PollsAgent.set_vote(polls, poll_id, socket.assigns.user.username, false, choice)
    else
      PollsAgent.set_vote(polls, poll_id, socket.id, true, choice)
    end

    {:noreply, socket}
  end
end
