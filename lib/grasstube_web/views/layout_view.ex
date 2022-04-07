defmodule GrasstubeWeb.LayoutView do
  use GrasstubeWeb, :view

  alias Grasstube.Guardian

  def title("room.html", b) do
    b.room
  end

  def title(_, _) do
    "grasstube 31"
  end
end
