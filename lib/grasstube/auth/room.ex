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
        conn |> assign(:chat, chat)
    end
  end
end

defmodule GrasstubeWeb.Plug.RoomAuth do
  import Plug.Conn
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
      |> put_session(:target, view)
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
      |> put_session(:target, view)
      |> redirect(to: GrasstubeWeb.Router.Helpers.live_path(conn, GrasstubeWeb.AuthLive, room))
    else
      conn
    end
  end
end
