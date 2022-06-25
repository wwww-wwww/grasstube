defmodule GrasstubeWeb.PollsLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{ChatAgent, PollsAgent, Presence, ProcessRegistry}

  def render(assigns) do
    GrasstubeWeb.PageView.render("polls_live.html", assigns)
  end

  def mount(_params, %{"room" => room, "current_user" => current_user, "chat" => chat}, socket) do
    topic = "polls:#{room}"

    user_id =
      if connected?(socket) do
        GrasstubeWeb.Endpoint.subscribe(topic)

        user_id =
          case current_user do
            %Grasstube.User{username: username} ->
              GrasstubeWeb.Endpoint.subscribe("user:#{room}:#{username}")
              username

            _ ->
              current_user
          end

        Presence.track(self(), topic, user_id, %{})
        user_id
      else
        nil
      end

    polls = ProcessRegistry.lookup(room, :polls)

    socket =
      socket
      |> assign(topic: topic)
      |> assign(user: current_user)
      |> assign(user_id: user_id)
      |> assign(chat: chat)
      |> assign(polls: polls)
      |> assign(controls: ChatAgent.controls?(chat, current_user))
      |> assign(polls_items: PollsAgent.get_polls(polls))

    {:ok, socket}
  end

  def terminate(_reason, socket) do
    Presence.untrack(self(), socket.assigns.topic, socket.assigns.user_id)

    presence = Presence.list(socket)

    if not Map.has_key?(presence, socket.assigns.user_id) and
         not Grasstube.User.is(socket.assigns.user) do
      PollsAgent.remove_vote(socket.assigns.polls, socket.assigns.user_id)
    end

    :ok
  end

  def handle_event("add", %{"title" => title, "choices" => choices}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      PollsAgent.add_poll(socket.assigns.polls, title, choices)
    end

    {:noreply, socket}
  end

  def handle_event("remove", %{"value" => id}, socket) do
    if ChatAgent.controls?(socket.assigns.chat, socket) do
      PollsAgent.remove_poll(socket.assigns.polls, id)
    end

    {:noreply, socket}
  end

  def handle_event("vote", %{"id" => poll_id, "value" => choice}, socket) do
    PollsAgent.set_vote(socket.assigns.polls, poll_id, socket.assigns.user_id, true, choice)

    {:noreply, socket}
  end

  def handle_info(%{event: "polls", payload: payload}, socket) do
    {:noreply, assign(socket, polls_items: payload)}
  end

  def handle_info(%{event: "controls"}, socket) do
    {:noreply, assign(socket, controls: ChatAgent.controls?(socket.assigns.chat, socket))}
  end

  def handle_info(%{event: "revoke_controls"}, socket) do
    {:noreply, assign(socket, controls: ChatAgent.controls?(socket.assigns.chat, socket))}
  end

  def handle_info(%{event: "presence_diff"}, socket) do
    {:noreply, socket}
  end
end
