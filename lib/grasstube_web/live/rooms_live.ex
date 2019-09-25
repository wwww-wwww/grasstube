defmodule GrasstubeWeb.RoomsLive do
  use Phoenix.LiveView
  
  @topic "rooms_updates"

  def render(assigns) do
    GrasstubeWeb.PageView.render("roomlist.html", assigns)
  end

  def get_rooms() do
    room_names = Grasstube.ProcessRegistry.list_rooms()
    room_names |> Enum.reduce([], fn name, acc ->
      case Grasstube.ProcessRegistry.lookup(name, :chat) do
        :not_found ->
          acc
        chat ->
          [{name, GrasstubeWeb.ChatAgent.get_users(chat) |> length} | acc]
      end
    end) |> Enum.sort_by(&{-elem(&1, 1), elem(&1, 0)})
  end

  def mount(_session, socket) do
    if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(@topic)
    {:ok, assign(socket, rooms: get_rooms())}
  end

  def handle_info(%{topic: @topic, payload: %{rooms: rooms}}, socket) do
    {:noreply, assign(socket, rooms: rooms)}
  end

  def update() do
    GrasstubeWeb.Endpoint.broadcast(@topic, "rooms:update", %{rooms: get_rooms()})
  end
end
