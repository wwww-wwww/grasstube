defmodule GrasstubeWeb.UserView do
  use GrasstubeWeb, :view

  alias Grasstube.Guardian
  alias Grasstube.Repo

  def title("sign_up.html", _) do
    "grasstube 31 - sign up"
  end

  def title("sign_in.html", _) do
    "grasstube 31 - sign in"
  end

  def title(_, _) do
    "grasstube 31"
  end
end
