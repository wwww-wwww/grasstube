defmodule GrasstubeWeb.YTController do
  use GrasstubeWeb, :controller

  def search(query) do
    keys = Application.get_env(:grasstube, :youtube_api_keys)

    key = keys |> Enum.at(rem(Grasstube.YTCounter.inc(), length(keys)))

    case HTTPoison.get("https://www.googleapis.com/youtube/v3/search", [],
           params: %{key: key, part: "snippet", type: "video", maxResults: 50, q: query}
         ) do
      {:ok, %HTTPoison.Response{body: body, status_code: 200}} ->
        case Jason.decode(body) do
          {:ok, %{"items" => items}} ->
            items =
              items
              |> Enum.map(fn %{
                               "id" => %{
                                 "videoId" => id
                               },
                               "snippet" => %{
                                 "channelId" => channel_id,
                                 "channelTitle" => channel_title,
                                 "title" => title
                               }
                             } ->
                %{id: id, title: title, channel_title: channel_title, channel_id: channel_id}
              end)
              |> Enum.reverse()

            %{success: 1, items: items}

          r ->
            %{success: 0, response: inspect(r)}
        end

      r ->
        %{success: 0, response: inspect(r)}
    end
  end

  def yt_search(conn, %{"query" => query}) do
    referer = get_req_header(conn, "referer")

    host = Application.get_env(:grasstube, GrasstubeWeb.Endpoint)[:url][:host]

    if length(referer) == 0 or
         not String.match?(referer |> Enum.at(0), ~r/^https{0,1}:\/\/#{host}/) do
      conn
      |> json(%{success: 0, response: "you are not allowed to do this!"})
    else
      conn |> json(search(query))
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

  def inc do
    Agent.get_and_update(__MODULE__, &{&1, &1 + 1})
  end
end
