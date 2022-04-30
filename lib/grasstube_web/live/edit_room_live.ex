defmodule GrasstubeWeb.EditRoomLive do
  use GrasstubeWeb, :live_view
  on_mount GrasstubeWeb.RoomAuth

  alias Grasstube.ChatAgent

  def render(assigns) do
    GrasstubeWeb.UserView.render("edit_room.html", assigns)
  end

  def mount(%{"room" => room}, _session, socket) do
    if ChatAgent.get_admin(socket.assigns.chat) == socket.assigns.current_user.username do
      if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(inspect(socket.assigns.chat))

      socket =
        socket
        |> assign(chat_state: ChatAgent.get(socket.assigns.chat))
        |> assign(chat: socket.assigns.chat)
        |> assign(room: room)
        |> assign(page_title: room)

      {:ok, socket}
    else
      {:ok,
       socket
       |> put_flash(:error, "You are not the owner of this room.")
       |> push_redirect(to: "/")}
    end
  end

  def handle_event("password", %{"password" => password}, socket) do
    ChatAgent.set_password(socket.assigns.chat, password)
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("op_add", %{"username" => username}, socket) do
    ChatAgent.add_mod(socket.assigns.chat, String.trim(username))
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("op_remove", %{"value" => username}, socket) do
    ChatAgent.remove_mod(socket.assigns.chat, username)
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("motd_set", %{"motd" => motd}, socket) do
    ChatAgent.set_motd(socket.assigns.chat, String.trim(motd))
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("emotelist_remove", %{"value" => value}, socket) do
    ChatAgent.remove_emotelist(socket.assigns.chat, value)
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("emotelist_add", %{"username" => username}, socket) do
    ChatAgent.add_emotelist(socket.assigns.chat, String.trim(username))
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("script_set", %{"key" => key, "script" => script}, socket) do
    ChatAgent.set_script(socket.assigns.chat, String.to_atom(key), script)
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("script_remove", %{"value" => key}, socket) do
    ChatAgent.remove_script(socket.assigns.chat, String.to_atom(key))
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("public_controls", %{"value" => "on"}, socket) do
    ChatAgent.set_public_controls(socket.assigns.chat, true)
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("public_controls", %{}, socket) do
    ChatAgent.set_public_controls(socket.assigns.chat, false)
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end

  def handle_event("close_room", %{"room" => room}, socket) do
    socket =
      if room == socket.assigns.room do
        Grasstube.ProcessRegistry.close_room(room)

        socket
        |> put_flash(:info, "Room closed.")
        |> push_redirect(to: "/")
      else
        socket
      end

    {:noreply, socket}
  end

  def handle_info(%{event: "details"}, socket) do
    {:noreply, assign(socket, chat_state: ChatAgent.get(socket.assigns.chat))}
  end
end
