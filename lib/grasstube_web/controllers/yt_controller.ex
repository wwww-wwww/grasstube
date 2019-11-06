defmodule GrasstubeWeb.YTController do
  use GrasstubeWeb, :controller

  def yt_search(conn, %{"query" => query}) do
    referer = get_req_header(conn, "referer")

    host = Application.get_env(:grasstube, GrasstubeWeb.Endpoint)[:url][:host]
    if length(referer) == 0 or not String.match?(referer |> Enum.at(0), ~r/^https{0,1}:\/\/#{host}/) do
      conn
      |> json(%{success: 0, response: "you are not allowed to do this!"})
    else
      keys = Application.get_env(:grasstube, :youtube_api_keys)
      
      key = keys |> Enum.at(rem(Grasstube.YTCounter.value(), length(keys)))
      Grasstube.YTCounter.increment()
      
      case HTTPoison.get("https://www.googleapis.com/youtube/v3/search", [],
        params: %{key: key, part: "snippet", type: "video", maxResults: 50, q: query}) do
        {:ok, %HTTPoison.Response{body: body, status_code: 200}} ->
          case Jason.decode(body) do
            {:ok, %{"items" => items}} ->
              items = items
              |> Enum.reduce([], fn (x, acc) ->
                %{"id" => %{
                    "videoId" => id
                  },
                  "snippet" => %{
                    "channelId" => channel_id,
                    "channelTitle" => channel_title,
                    "title" => title
                  }} = x

                [%{id: id, title: title, channel_title: channel_title, channel_id: channel_id} | acc]
              end)
              |> Enum.reverse()

              conn
              |> json(%{success: 1, items: items})
            r ->
              conn
              |> json(%{success: 0, response: r})
          end
        r ->
          conn
          |> json(%{success: 0, response: r})
      end
    end
  end

  def yt_search(conn, _) do
    conn
    |> json(%{success: 0, response: "what??"})
  end
end

defmodule Grasstube.YTCounter do
  use Agent

  def start_link(_) do
    Agent.start_link(fn -> 0 end, name: __MODULE__)
  end

  def value do
    Agent.get(__MODULE__, & &1)
  end

  def increment do
    Agent.update(__MODULE__, &(&1 + 1))
  end
end
