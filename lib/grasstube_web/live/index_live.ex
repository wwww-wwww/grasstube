defmodule GrasstubeWeb.IndexLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{ProcessRegistry, RoomAgent, Presence}
  alias GrasstubeWeb.Endpoint

  @topic "room_list"

  def render(assigns) do
    ~H"""
    <%= if @current_scope.user do %>
      <.link href="/create-room">Create Room</.link>
    <% end %>

    <div class="roomlist">
      <%= for {r, users} <- @rooms do %>
        <.link patch={~p"/room/#{r.title}"}>
          <span>{r.title}</span>
          <div><span class="users">{users}</span><span>{to_string(r.inserted_at)}</span></div>
        </.link>
      <% end %>
    </div>
    """
  end

  def mount(_, _session, socket) do
    if connected?(socket), do: Endpoint.subscribe(@topic)

    rooms = get_rooms()

    socket =
      socket
      |> assign(rooms: rooms)

    {:ok, socket}
  end

  def get_rooms() do
    ProcessRegistry.list_rooms()
    |> Enum.map(fn id ->
      users =
        Presence.list("room:#{id}")
        |> Map.to_list()
        |> length

      {ProcessRegistry.get(id, RoomAgent), users}
    end)
  end

  def update() do
    rooms = get_rooms()
    Endpoint.broadcast(@topic, "rooms", rooms)
  end

  def handle_info(%{event: "rooms", payload: rooms}, socket) do
    {:noreply, assign(socket, rooms: rooms)}
  end
end
