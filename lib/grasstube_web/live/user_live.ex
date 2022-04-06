defmodule GrasstubeWeb.UserLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.ChatAgent

  def render(assigns) do
    GrasstubeWeb.PageView.render("auth_live.html", assigns)
  end

  def mount(%{"room" => room}, %{"target" => target}, socket) do
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
          |> assign(target: target)
      end

    {:ok, socket}
  end

  def handle_event(
        "auth",
        %{"password" => password},
        %{assigns: %{room: room, target: target, chat: chat}} = socket
      ) do
    socket =
      if ChatAgent.check_password(chat, password) do
        socket
        |> push_redirect(
          to: Routes.live_path(socket, target, room),
          replace: true
        )
      else
        socket
        |> put_flash(:error, "Incorrect password")
      end

    {:noreply, socket}
  end
end
