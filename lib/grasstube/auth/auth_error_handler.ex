defmodule Grasstube.AuthErrorHandler do
  import Plug.Conn
  import Phoenix.Controller

  def auth_error(conn, {type, _reason}, _opts) do
    conn
    |> put_flash(:error, to_string(type))
    |> redirect(to: "/")
  end
end
