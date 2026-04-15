defmodule GrasstubeWeb.ChatLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Room, Repo, ProcessRegistry, ChatAgent}

  def render(assigns) do
    ~H"""
    <div class="messages">
      <%= for m <- @messages do %>
        {inspect(m)}
      <% end %>
    </div>
    <form phx-submit="send-message">
      <input name="message"/>
    </form>
    """
  end

  def mount(:not_mounted_at_router, params, socket) do
    mount(params, nil, socket)
  end

  def mount(%{"room_id" => room_id}, _session, socket) do
    room = Repo.get(Room, room_id)

    chat =
      ProcessRegistry.get(room_id, ChatAgent)
      |> IO.inspect()

    socket =
      socket
      |> assign(room: room)
      |> assign(history: chat.history)

    {:ok, socket}
  end

  def handle_event("send-message", %{"message" => message}, socket) do
    {:noreply, socket}
  end
end
