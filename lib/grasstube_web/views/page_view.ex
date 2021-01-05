defmodule GrasstubeWeb.PageView do
  use GrasstubeWeb, :view

  def title("room.html", b) do
    b.room
  end

  def title(_, _) do
    "grasstube 30"
  end
end
