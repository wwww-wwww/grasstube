defmodule GrasstubeWeb.ChatComponent do
  use GrasstubeWeb, :live_component

  alias Grasstube.{ChatAgent, ProcessRegistry}

  def render(assigns) do
    ~H"""
    <div class="ChatComponent" id={"chat-#{@state.room_id}"} phx-hook="chat" phx-update="ignore">
      <div class="messages">
        <%= for {sender, message} <- @state.history |> Enum.reverse do %>
          <div>
            <span>{sender}</span>: <span>{message}</span>
          </div>
        <% end %>
      </div>
      <input name="message" autocomplete="off" />
    </div>
    """
  end

  def update(assigns, socket) do
    socket =
      socket
      |> subscribe_once("chat:#{assigns.state.room_id}")
      |> assign(assigns)

    {:ok, socket}
  end

  def handle_event("send_message", %{"message" => message}, socket) do
    ChatAgent.chat(socket.assigns.pid, socket.assigns.current_scope.user, message)

    {:noreply, socket}
  end

  defmacro __using__(_opts) do
    quote do
      def handle_info(%{topic: "chat:" <> _, event: "message", payload: message}, socket) do
        socket = push_event(socket, "message", message)
        {:noreply, socket}
      end
    end
  end
end
