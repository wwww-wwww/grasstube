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
          |> redirect(to: "/")

        _chat ->
          socket
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
      |> put_flash(:password, password)
      |> push_redirect(to: Routes.live_path(socket, target, room))

    {:noreply, socket}
  end

  def handle_event(
        "auth",
        %{"password" => password},
        %{assigns: %{room: room}} = socket
      ) do
    socket =
      socket
      |> put_flash(:password, password)
      |> push_redirect(to: Routes.live_path(socket, GrasstubeWeb.RoomLive, room))

    {:noreply, socket}
  end
end
