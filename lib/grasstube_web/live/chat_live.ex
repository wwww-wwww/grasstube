defmodule GrasstubeWeb.ChatLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Presence, ChatAgent}

  def render(assigns) do
    GrasstubeWeb.PageView.render("chat_live.html", assigns)
  end

  def mount(_params, %{"room" => room, "current_user" => current_user} = session, socket) do
    IO.inspect("chat_live #{inspect(session)}")
    topic = "chat:#{room}"
    if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(topic)

    chat = Grasstube.ProcessRegistry.lookup(room, :chat)

    socket_id = GrasstubeWeb.UserSocket.new_id()
    GrasstubeWeb.Endpoint.subscribe(socket_id)

    user_id =
      if is_nil(current_user) do
        "$" <> socket_id
      else
        current_user.username
      end

    socket =
      socket
      |> assign(chat: chat)
      |> assign(room: room)
      |> assign(topic: topic)
      |> assign(user_id: user_id)
      |> assign(user: current_user)
      |> assign(id: socket_id)
      |> assign(history: ChatAgent.get_history(chat))
      |> assign(emotes: ChatAgent.get_emotes(chat))

    meta =
      if not is_nil(current_user),
        do: %{nickname: current_user.nickname, username: current_user.username},
        else: %{nickname: "anon#{socket.assigns.id}"}

    Presence.track(self(), topic, socket.assigns.user_id, meta)

    socket =
      socket
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
