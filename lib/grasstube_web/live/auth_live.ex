defmodule GrasstubeWeb.AuthLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.ChatAgent

  def render(assigns) do
    GrasstubeWeb.PageView.render("auth_live.html", assigns)
  end

  def mount(%{"room" => room}, session, socket) do
    socket =
      case Grasstube.ProcessRegistry.lookup(room, :chat) do
        :not_found ->
          socket
          |> put_flash(:error, "Room does not exist")
          |> redirect(to: "/")

        chat ->
          socket
          |> assign(chat: chat)
          |> assign(room: room)
      end

    {:ok, socket}
  end

  def handle_event(
        "auth",
        %{"password" => password},
        %{assigns: %{room: room, chat: chat, flash: %{"target" => target}}} = socket
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
        %{assigns: %{room: room, chat: chat}} = socket
      ) do
    socket =
      socket
      |> put_flash(:password, password)
      |> push_redirect(to: Routes.live_path(socket, GrasstubeWeb.RoomLive, room))

    {:noreply, socket}
  end
end
