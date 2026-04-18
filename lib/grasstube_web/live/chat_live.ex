defmodule GrasstubeWeb.ChatLive do
  use GrasstubeWeb, :live_view

  alias GrasstubeWeb.Endpoint
  alias Grasstube.{ProcessRegistry, ChatAgent, Repo, Room}

  def render(assigns) do
    ~H"""
    <div id={"chat-#{@room_id}"} phx-hook="chat" phx-update="ignore" keybinds={@keybinds}>
      <div class="emotes">
        <div>
          <div :for={e <- @emotes} class="emote" name={e.name}>
            <img src={~p"/emotes/#{to_string(e.id) <> ".png"}"} alt={":#{e.name}:"} />
            <span>:{e.name}:</span>
          </div>
        </div>
      </div>
      <div class="messages">
        <div :for={%{time: time, sender: sender, html: html} <- @history} class="message">
          <span class="time">[{time}]</span><span><span>{sender}</span>:</span><span>{raw(html)}</span>
        </div>
      </div>
      <div class="bottom">
        <input class="message-input" autocomplete="off" />
      </div>
    </div>
    """
  end

  def mount(:not_mounted_at_router, session, socket) do
    socket = socket |> assign(current_scope: session["current_scope"])
    mount(%{"room_id" => session["room_id"]}, session, socket)
  end

  def mount(%{"title" => title}, session, socket) do
    Repo.get_by(Room, title: title)
    |> case do
      nil ->
        {:ok, socket |> push_navigate(to: ~p"/")}

      room ->
        mount(%{"room_id" => room.id}, session, socket)
    end
  end

  def mount(%{"room_id" => room_id}, _session, socket) do
    pid = ProcessRegistry.lookup(room_id, ChatAgent)
    chat = ChatAgent.get(pid)

    keybinds =
      chat.emotes
      |> Enum.filter(&(&1.keybind != nil and String.length(&1.keybind) > 0))
      |> Enum.map(&{&1.keybind, ":#{&1.name}:"})
      |> Map.new()
      |> Jason.encode!()

    socket =
      socket
      |> assign(room_id: room_id)
      |> assign(pid: pid)
      |> assign(history: chat.history)
      |> assign(emotes: chat.emotes)
      |> assign(keybinds: keybinds)

    if connected?(socket) do
      Endpoint.subscribe("chat:#{room_id}")
      Endpoint.subscribe("chat_user:#{socket.assigns.current_scope.id}")
    end

    {:ok, socket}
  end

  def handle_event("send_message", %{"message" => message}, socket) do
    ChatAgent.chat(socket.assigns.pid, socket.assigns.current_scope, message, fn message ->
      push_event(socket, "message", message)
    end)

    {:noreply, socket}
  end

  def handle_info(%{topic: "chat:" <> _, event: "message", payload: message}, socket) do
    socket = push_event(socket, "message", message)
    {:noreply, socket}
  end

  def handle_info(%{topic: "chat_user:" <> _, event: "message", payload: message}, socket) do
    socket = push_event(socket, "message", message)
    {:noreply, socket}
  end
end
