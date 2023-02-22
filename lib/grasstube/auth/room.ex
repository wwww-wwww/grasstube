defmodule GrasstubeWeb.RoomAuth do
  import Phoenix.LiveView
  import Phoenix.Component

  alias Grasstube.ChatAgent
  alias GrasstubeWeb.Router.Helpers, as: Routes

  def on_mount(:default, %{"room" => room, "password" => password}, _session, socket) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        {:halt,
         socket
         |> put_flash(:error, "Room does not exist")
         |> push_navigate(to: "/")}

      chat ->
        if not ChatAgent.password?(chat) or ChatAgent.mod?(chat, socket.assigns.current_user) or
             ChatAgent.check_password(chat, password) do
          {:cont,
           socket
           |> assign(:chat, chat)
           |> assign(:room, room)}
        else
          {:halt,
           socket
           |> put_flash(:error, "Bad password")
           |> put_flash(:target, socket.view)
           |> push_navigate(to: Routes.live_path(socket, GrasstubeWeb.AuthLive, room))}
        end
    end
  end

  def on_mount(:default, %{"room" => room}, session, socket) do
    on_mount(:default, %{"room" => room, "password" => ""}, session, socket)
  end

  def on_mount(:default, _map, _session, socket) do
    {:cont, socket}
  end
end
