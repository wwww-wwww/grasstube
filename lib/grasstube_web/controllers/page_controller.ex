defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  def gdrive(conn, _) do
    render(conn, "userscript.html")
  end
end
