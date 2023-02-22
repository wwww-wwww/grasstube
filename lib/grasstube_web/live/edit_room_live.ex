defmodule GrasstubeWeb.EditRoomLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.RoomAuth

  alias Grasstube.{Repo, Room}

  def render(assigns) do
    GrasstubeWeb.UserView.render("edit_room.html", assigns)
  end

  def mount(%{"room" => room}, _session, socket) do
    if Room.get_room(room).user_username == socket.assigns.current_user.username do
      if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(room)

      socket =
        socket
        |> assign(chat: socket.assigns.chat)
        |> assign(room: Room.get_room(room) |> Repo.preload([:mods, :emotelists]))
        |> assign(page_title: room)

      {:ok, socket}
    else
      {:ok,
       socket
       |> put_flash(:error, "You are not the owner of this room.")
       |> push_navigate(to: "/")}
    end
  end

  def get_room(socket) do
    Repo.get(Room, socket.assigns.room.id) |> Repo.preload([:mods, :emotelists])
  end

  def handle_event("password", %{"password" => password}, socket) do
    Room.set_password(socket.assigns.room, password)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("op_add", %{"username" => username}, socket) do
    Room.add_mod(socket.assigns.room, username)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("op_remove", %{"value" => username}, socket) do
    Room.remove_mod(socket.assigns.room, username)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("motd_set", %{"motd" => motd}, socket) do
    Room.set_motd(socket.assigns.room, motd)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("emotelist_add", %{"username" => username}, socket) do
    Room.add_emotelist(socket.assigns.room, username)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("emotelist_remove", %{"value" => value}, socket) do
    Room.remove_emotelist(socket.assigns.room, value)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("script_set", %{"key" => key, "script" => script}, socket) do
    Room.set_script(socket.assigns.room, String.to_atom(key), script)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("script_remove", %{"value" => key}, socket) do
    Room.remove_script(socket.assigns.room, String.to_atom(key))
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("public_controls", %{"value" => "on"}, socket) do
    Room.set_public_controls(socket.assigns.room, true)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("public_controls", %{}, socket) do
    Room.set_public_controls(socket.assigns.room, false)
    {:noreply, assign(socket, room: get_room(socket))}
  end

  def handle_event("close_room", %{"room" => room}, socket) do
    socket =
      if room == socket.assigns.room.title do
        Grasstube.ProcessRegistry.delete_room(room)

        socket
        |> put_flash(:info, "Room closed.")
        |> push_navigate(to: "/")
      else
        socket
      end

    {:noreply, socket}
  end

  def handle_info(%{event: "details"}, socket) do
    {:noreply, assign(socket, room: get_room(socket))}
  end
end
