defmodule GrasstubeWeb.RoomsLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.ProcessRegistry

  @topic "rooms_updates"

  def render(assigns) do
    GrasstubeWeb.PageView.render("roomlist.html", assigns)
  end

  def get_rooms() do
    ProcessRegistry.list_rooms()
    |> Enum.reduce([], fn name, acc ->
      chat = ProcessRegistry.lookup(name, :chat)

      [
        %{
          name: name,
          users: Grasstube.Presence.list("chat:#{name}") |> Enum.count(),
          has_password: Grasstube.ChatAgent.password?(chat),
          owner: Grasstube.ChatAgent.admin(chat)
        }
        | acc
      ]
    end)
    |> Enum.sort_by(&{-&1.users, &1.name})
  end

  def mount(_, _session, socket) do
    if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(@topic)

    can_make_room =
      Grasstube.User.is(socket.assigns.current_user) and
        (Application.get_env(:grasstube, :max_rooms) == :unlimited or
           socket.assigns.current_user
           |> Grasstube.Repo.preload(:rooms)
           |> Map.get(:rooms)
           |> length()
           |> Kernel.<(Application.get_env(:grasstube, :max_rooms)))

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
