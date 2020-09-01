defmodule GrasstubeWeb.ChatChannel do
  use Phoenix.Channel

  alias Grasstube.Presence

  alias GrasstubeWeb.ChatAgent

  @max_name_length 24
  
  def join("chat:" <> room_name, %{"password" => password}, socket) do
    case ChatAgent.auth(socket, room_name, password) do
      {:ok, socket} ->
        send(self(), {:after_join, nil})
        {:ok, socket}
      resp ->
        resp
    end
  end

  def handle_info({:after_join, _}, socket) do
    "chat:" <> room_name = socket.topic
    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    meta = if Guardian.Phoenix.Socket.authenticated?(socket), do: %{}, else: %{nickname: "anon#{socket.id}"}

    presence = Presence.list(socket)

    Presence.track(socket, socket.assigns.user_id, meta)
    
    push(socket, "presence_state", Presence.list(socket))

    if not Map.has_key?(presence, socket.assigns.user_id) do
      GrasstubeWeb.RoomsLive.update()
    end

    history = ChatAgent.get_history(chat)
    if length(history) > 0 do
      push(socket, "history", %{"list" => history})
    end

    motd = ChatAgent.get_motd(chat)
    if String.length(motd) > 0 do
      push(socket, "chat", %{sender: "sys", name: room_name, content: motd})
    end

    {:noreply, socket}
  end
  
  def terminate(_, socket) do
    Presence.untrack(socket, socket.assigns.user_id)
    presence = Presence.list(socket)
    if not Map.has_key?(presence, socket.assigns.user_id) do
      GrasstubeWeb.RoomsLive.update()
    end
  end

  def handle_in("chat", %{"msg" => msg}, socket) do
    "chat:" <> room_name = socket.topic
    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)
    
    if String.length(msg) > 0 do
      ChatAgent.chat(chat, socket, msg)
    end

    {:noreply, socket}
  end

  def handle_in("setname", %{"name" => name}, socket) do
    if String.length(name) > 0 and String.length(name) <= @max_name_length do
      new_nickname =
        cond do
          String.downcase(name) == "anon" ->
            "anon#{socket.id}"

          #ChatAgent.get_users(chat)
          #|> Enum.any?(fn s -> String.downcase(s.nickname) == String.downcase(name) end) ->
          #  name <> "0"

          true ->
            name
        end

        # TODO: check for reserved names

      ChatAgent.set_name(socket, new_nickname)
      Presence.update(socket, socket.assigns.user_id, %{nickname: new_nickname})
    else
      push(socket, "chat", %{
        id: "sys",
        content: "nickname must be between 1 and #{@max_name_length} characters"
      })
    end

    {:noreply, socket}
  end
end
