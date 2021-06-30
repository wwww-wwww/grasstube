defmodule GrasstubeWeb.RoomsLive do
  use GrasstubeWeb, :live_view

  @topic "rooms_updates"

  def render(assigns) do
    GrasstubeWeb.PageView.render("roomlist.html", assigns)
  end

  def get_rooms() do
    room_names = Grasstube.ProcessRegistry.list_rooms()

    room_names
    |> Enum.reduce([], fn name, acc ->
      chat = Grasstube.ProcessRegistry.lookup(name, :chat)

      [
        {name, Grasstube.Presence.list("chat:#{name}") |> Enum.count(),
         Grasstube.ChatAgent.password?(chat)}
        | acc
      ]
    end)
    |> Enum.sort_by(&{-elem(&1, 1), elem(&1, 0)})
  end

  def mount(_, session, socket) do
    if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(@topic)

    user = Grasstube.Guardian.user(session)
    can_make_room = if user do
      rooms = Grasstube.ProcessRegistry.rooms_of(user.username)
      length(rooms) == 0
    else
      false
    end

    socket =
      socket
      |> assign(user: user)
      |> assign(rooms: get_rooms())
      |> assign(can_make_room: can_make_room)

    {:ok, socket}
  end

  def handle_info(%{topic: @topic, payload: %{rooms: rooms}}, socket) do
    {:noreply, assign(socket, rooms: rooms)}
  end

  def update() do
    GrasstubeWeb.Endpoint.broadcast(@topic, "rooms:update", %{rooms: get_rooms()})
  end
end
