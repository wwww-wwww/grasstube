defmodule GrasstubeWeb.LayoutView do
  use GrasstubeWeb, :view

  def referer(conn) do
    conn.req_headers
    |> Enum.filter(&(elem(&1, 0) == "referer"))
    |> case do
      [] ->
        ""

      [{"referer", referer}] ->
        referer
        |> String.replace("https://", "")
        |> String.split("/")
        |> Enum.at(0)
    end
  end
end
