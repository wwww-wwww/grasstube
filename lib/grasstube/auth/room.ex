defmodule GrasstubeWeb.Plug.RoomExists do
  import Plug.Conn
  import Phoenix.Controller

  def init(options), do: options

  def call(%{params: %{"room" => room}} = conn, _opts) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        conn
        |> put_flash(:error, "Room does not exist")
        |> redirect(to: "/")

      chat ->
        assign(conn, :chat, chat)
    end
  end
end

defmodule GrasstubeWeb.Plug.RoomAuth do
  import Phoenix.Controller

  alias Grasstube.ChatAgent

  def init(options), do: options

  def call(
        %{
          assigns: %{chat: chat},
          params: %{"room" => room, "password" => password},
          private: %{phoenix_live_view: {view, _, _}}
        } = conn,
        _opts
      ) do
    if not ChatAgent.check_password(chat, password) do
      conn
      |> put_flash(:target, view)
      |> redirect(to: GrasstubeWeb.Router.Helpers.live_path(conn, GrasstubeWeb.AuthLive, room))
    else
      conn
    end
  end

  def call(
        %{
          assigns: %{chat: chat},
          params: %{"room" => room},
          private: %{phoenix_live_view: {view, _, _}}
        } = conn,
        _opts
      ) do
    if ChatAgent.password?(chat) and
         not ChatAgent.mod?(chat, Guardian.Plug.current_resource(conn)) do
      conn
      |> put_flash(:target, view)
      |> redirect(to: GrasstubeWeb.Router.Helpers.live_path(conn, GrasstubeWeb.AuthLive, room))
    else
      conn
    end
  end
end

defmodule GrasstubeWeb.LiveAuth do
  import Phoenix.LiveView

  alias Grasstube.ChatAgent

  def check_room(socket, session, room, fun) do
    socket =
      assign_new(socket, :current_user, fn ->
        Grasstube.Guardian.user(session)
      end)

    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        socket =
          socket
          |> put_flash(:error, "Room does not exist")
          |> push_redirect(to: "/")

        {:halt, socket}

      chat ->
        fun.(socket, chat)
    end
  end

  def on_mount(
        :default,
        %{"room" => room},
        session,
        %{assigns: %{flash: %{"password" => password}}} = socket
      ) do
    check_room(socket, session, room, fn socket, chat ->
      if ChatAgent.password?(chat) and ChatAgent.check_password(chat, password) do
        {:cont, assign(socket, :chat, chat)}
      else
        socket =
          socket
          |> put_flash(:error, "Bad password")
          |> push_redirect(
            to: GrasstubeWeb.Router.Helpers.live_path(socket, GrasstubeWeb.AuthLive, room)
          )

        {:halt, socket}
      end
    end)
  end

  def on_mount(:default, %{"room" => room}, session, socket) do
    check_room(socket, session, room, fn socket, chat ->
      if ChatAgent.password?(chat) and
           not ChatAgent.mod?(chat, socket.assigns.current_user) do
        socket =
          socket
          |> push_redirect(
            to: GrasstubeWeb.Router.Helpers.live_path(socket, GrasstubeWeb.AuthLive, room)
          )

        {:halt, socket}
      else
        {:cont, assign(socket, :chat, chat)}
      end
    end)
  end
end
