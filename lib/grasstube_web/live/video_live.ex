defmodule GrasstubeWeb.VideoLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Presence, ChatAgent}

  @topic "video_live"

  def render(assigns) do
    GrasstubeWeb.PageView.render("video_live.html", assigns)
  end

  def mount(params, %{"room" => room} = session, socket) do
    topic = "video:#{room}"
    if connected?(socket), do: GrasstubeWeb.Endpoint.subscribe(topic)

    chat = Grasstube.ProcessRegistry.lookup(room, :chat)

    user = Grasstube.Guardian.user(session)

    socket_id = GrasstubeWeb.UserSocket.new_id()
    GrasstubeWeb.Endpoint.subscribe(socket_id)

    user_id =
      if is_nil(user) do
        "$" <> socket_id
      else
        user.username
      end

    socket =
      socket
      |> assign(chat: chat)
      |> assign(topic: topic)
      |> assign(user_id: user_id)
      |> assign(user: user)
      |> assign(id: socket_id)

    {:ok, socket}
  end
end
