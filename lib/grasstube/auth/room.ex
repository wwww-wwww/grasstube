defmodule GrasstubeWeb.Plug.RoomExists do
  import Plug.Conn
  import Phoenix.Controller

  def init(options), do: options

  def call(
        %{
          params: %{"room" => "null"},
          adapter: {_, %{headers: %{"referer" => referer}}}
        } = conn,
        _opts
      ) do
    redirect(conn, to: URI.parse(referer).path)
  end

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
  alias GrasstubeWeb.Router.Helpers, as: Routes

  def init(options), do: options

  def call(
        %{
          params: %{"room" => room, "password" => password},
          private: %{phoenix_live_view: {view, _, _}}
        } = conn,
        _opts
      ) do
    chat = Grasstube.ProcessRegistry.lookup(room, :chat)

    if not ChatAgent.check_password(chat, password) do
      conn
      |> put_flash(:target, view)
      |> redirect(to: Routes.live_path(conn, GrasstubeWeb.AuthLive, room))
    else
      conn
    end
  end

  def call(
        %{
          assigns: %{current_user: current_user},
          params: %{"room" => room},
          private: %{phoenix_live_view: {view, _, _}}
        } = conn,
        _opts
      ) do
    chat = Grasstube.ProcessRegistry.lookup(room, :chat)

    if ChatAgent.password?(chat) and not ChatAgent.mod?(chat, current_user) do
      conn
      |> put_flash(:target, view)
      |> redirect(to: Routes.live_path(conn, GrasstubeWeb.AuthLive, room))
    else
      conn
    end
  end
end

defmodule GrasstubeWeb.RoomAuth do
  import Phoenix.LiveView

  alias Grasstube.ChatAgent
  alias GrasstubeWeb.Router.Helpers, as: Routes

  def check_room(socket, room, fun) do
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
        _session,
        %{assigns: %{flash: %{"password" => password}}} = socket
      ) do
    socket
    |> check_room(room, fn socket, chat ->
      if ChatAgent.password?(chat) and ChatAgent.check_password(chat, password) do
        {:cont, assign(socket, :chat, chat)}
      else
        socket =
          socket
          |> put_flash(:error, "Bad password")
          |> push_redirect(to: Routes.live_path(socket, GrasstubeWeb.AuthLive, room))

        {:halt, socket}
      end
    end)
  end

  def on_mount(:default, %{"room" => room}, _session, socket) do
    socket
    |> check_room(room, fn socket, chat ->
      if ChatAgent.password?(chat) and
           not ChatAgent.mod?(chat, socket.assigns.current_user) do
        socket =
          socket
          |> push_redirect(to: Routes.live_path(socket, GrasstubeWeb.AuthLive, room))

        {:halt, socket}
      else
        {:cont, assign(socket, :chat, chat)}
      end
    end)
  end

  def on_mount(:default, _map, _session, socket) do
    {:cont, socket}
  end
end
