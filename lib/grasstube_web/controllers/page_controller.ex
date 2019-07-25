defmodule GrasstubeWeb.PageController do
  use GrasstubeWeb, :controller

  def index(conn, _params) do
    render(conn, "index.html", name: "index")
  end

  def chat(conn, _params) do
    render(conn, "chat.html", name: "chat")
  end

  def video(conn, _params) do
    render(conn, "video.html", name: "video")
  end
end
