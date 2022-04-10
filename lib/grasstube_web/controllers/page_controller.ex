defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  alias Grasstube.Guardian
  alias Grasstube.ChatAgent

  def emotes(conn, %{"room" => room}) do
    case Grasstube.ProcessRegistry.lookup(room, :chat) do
      :not_found ->
        json(conn, %{success: false, message: "room not found"})

      chat ->
        emotes = Grasstube.ChatAgent.get_emotes(chat)
        json(conn, %{success: true, emotes: emotes})
    end
  end

  def list_rooms(conn, _) do
    json(
      conn,
      Grasstube.ProcessRegistry.list_rooms()
      |> Enum.reduce(%{}, fn name, acc ->
        Map.put(acc, name, Grasstube.Presence.list("chat:#{name}") |> Enum.count())
      end)
    )
  end

  def gdrive(conn, _) do
    render(conn, "userscript.html")
  end

  def password_required?(conn, chat) do
    not (Guardian.Plug.authenticated?(conn) and
           Grasstube.ChatAgent.mod?(chat, Guardian.Plug.current_resource(conn))) and
      ChatAgent.password?(chat)
  end
end
