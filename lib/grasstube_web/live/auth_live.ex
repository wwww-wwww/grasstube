defmodule GrasstubeWeb.AuthLive do
  use GrasstubeWeb, :live_view

  def render(assigns) do
    GrasstubeWeb.PageView.render("auth_live.html", assigns)
  end

  def mount(%{"room" => room}, _session, socket) do
    socket =
      case Grasstube.ProcessRegistry.lookup(room, :chat) do
        :not_found ->
          socket
          |> put_flash(:error, "Room does not exist")
          |> push_navigate(to: "/")

        _chat ->
          socket
          |> assign(page_title: room)
          |> assign(room: room)
      end

    {:ok, socket}
  end

  def handle_event(
        "auth",
        %{"password" => password},
        %{assigns: %{room: room, flash: %{"target" => target}}} = socket
      ) do
    socket =
      socket
      |> put_flash(:target, target)
      |> push_navigate(to: Routes.live_path(socket, target, room, password: password))

    {:noreply, socket}
  end

  def handle_event("auth", %{"password" => password}, socket) do
    socket =
      push_navigate(socket,
        to:
          Routes.live_path(socket, GrasstubeWeb.RoomLive, socket.assigns.room, password: password)
      )

    {:noreply, socket}
  end
end
