defmodule GrasstubeWeb.RoomsLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.LiveAuth

  alias Grasstube.ProcessRegistry

  @topic "rooms_updates"

  def render(assigns) do
    GrasstubeWeb.PageView.render("roomlist.html", assigns)
  end

  def get_rooms() do
    room_names = ProcessRegistry.list_rooms()

    room_names
    |> Enum.reduce([], fn name, acc ->
      chat = ProcessRegistry.lookup(name, :chat)

      [
        {name, Grasstube.Presence.list("chat:#{name}") |> Enum.count(),
         Grasstube.ChatAgent.password?(chat)}
        | acc
      ]
    end)
    |> Enum.sort_by(&{-elem(&1, 1), elem(&1, 0)})
  end

  def mount(_, _session, socket) do
    if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(@topic)

    can_make_room =
      socket.assigns.current_user
      |> ProcessRegistry.rooms_of()
      |> length()
      |> Kernel.==(0)

    socket =
      socket
      |> assign(page_title: "Rooms")
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
