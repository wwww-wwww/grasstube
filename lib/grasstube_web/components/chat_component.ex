defmodule GrasstubeWeb.ChatComponent do
  use GrasstubeWeb, :live_component

  alias Grasstube.{ChatAgent, ProcessRegistry}

  def render(assigns) do
    ~H"""
    <div class="ChatComponent">
      <div class="messages">
        <%= for {sender, message} <- @state.history |> Enum.reverse do %>
          <div>
            <span>{sender}</span>:
            <span>{message}</span>
          </div>
        <% end %>
      </div>
      <form phx-submit="send_message" phx-target={@myself}>
        <input name="message" autocomplete="off"/>
      </form>
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
      def handle_info(%{topic: "chat:" <> _, event: "update", payload: state}, socket) do
        # GrasstubeWeb.ChatComponent.update_assigns(state.room_id, state: state)
        {:noreply, socket}
      end
    end
  end
end
