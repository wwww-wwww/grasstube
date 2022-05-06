defmodule GrasstubeWeb.ChatLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Presence, ChatAgent}

  def render(assigns) do
    GrasstubeWeb.PageView.render("chat_live.html", assigns)
  end

  def mount(
        _params,
        %{"room" => room, "current_user" => current_user, "chat" => chat},
        socket
      ) do
    topic = "chat:#{room}"

    user_id =
      if connected?(socket) do
        GrasstubeWeb.Endpoint.subscribe(topic)

        user_id =
          if is_nil(current_user) do
            "$" <> GrasstubeWeb.UserSocket.new_id()
          else
            current_user.username
          end

        meta =
          if not is_nil(current_user),
            do: %{nickname: current_user.nickname, username: current_user.username},
            else: %{nickname: "anon#{user_id |> String.slice(1..-1)}"}

        Presence.track(self(), topic, user_id, meta)
        user_id
      else
        nil
      end

    socket =
      socket
      |> assign(room: room)
      |> assign(topic: topic)
      |> assign(user: current_user)
      |> assign(user_id: user_id)
      |> assign(chat: chat)
      |> assign(history: ChatAgent.get_history(chat))
      |> assign(emotes: ChatAgent.get_emotes(chat))
      |> assign(users: Presence.list(topic))

    case ChatAgent.get_motd(chat) do
      "" ->
        nil

      motd ->
        send(self(), %{event: "chat", payload: %{sender: "sys", name: room, content: motd}})
    end

    {:ok, socket}
  end

  def terminate(_reason, socket) do
    Presence.untrack(self(), socket.assigns.topic, socket.assigns.user_id)
    :ok
  end

  def handle_event("chat", %{"message" => message}, socket) do
    message = String.trim(message)

    if String.length(message) > 0 do
      ChatAgent.chat(socket.assigns.chat, {socket, self()}, message)
    end

    {:noreply, socket}
  end

  def handle_info(%{event: "presence_diff"}, socket) do
    {:noreply, socket |> assign(users: Presence.list(socket.assigns.topic))}
  end

  def handle_info(%{event: "chat", payload: payload}, socket) do
    {:noreply, push_event(socket, "chat", payload)}
  end

  def handle_info(%{event: "clear"}, socket) do
    {:noreply, push_event(socket, "clear", %{})}
  end
end
