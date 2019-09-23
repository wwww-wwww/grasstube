defmodule GrasstubeWeb.ChatChannel do
  use Phoenix.Channel
  require Logger

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.ChatAgent
  alias GrasstubeWeb.User

  @max_name_length 24
  
  def join("chat:" <> room_name, _message, socket) do
    case Grasstube.ProcessRegistry.lookup(room_name, :chat) do
      :not_found ->
        {:error, "no room"}
        
      channel ->
        :ok = ChannelWatcher.monitor(:rooms, self(), {__MODULE__, :leave, [socket, socket.topic]})

        new_user = if Guardian.Phoenix.Socket.authenticated?(socket) do
            user = Guardian.Phoenix.Socket.current_resource(socket)
            %User{id: socket.id, socket: socket, username: user.username, nickname: user.nickname}
          else
            %User{id: socket.id, socket: socket, nickname: "anon#{socket.id}"}
          end
          
        ChatAgent.add_user(channel, new_user)

        send(self(), {:after_join, nil})
        {:ok, socket}
    end
  end

  def handle_info({:after_join, _}, socket) do
    "chat:" <> room_name = socket.topic
    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    Endpoint.broadcast(socket.topic, "userlist", %{list: ChatAgent.get_userlist(chat)})

    history = ChatAgent.get_history(chat)
    if length(history) > 0 do
      push(socket, "history", %{"list" => history})
    end

    {:noreply, socket}
  end

  def handle_info({ref, _}, socket) do
    Process.demonitor(ref, [:flush])
    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end
  
  def leave(socket, topic) do
    "chat:" <> room_name = topic
    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)

    case ChatAgent.get_user(chat, socket.id) do
      :not_found ->
        nil

      _ ->
        ChatAgent.remove_user(chat, socket.id)
        Logger.info(socket.id <> " left")
        Endpoint.broadcast(topic, "userlist", %{list: ChatAgent.get_userlist(chat)})
    end
  end

  def handle_in("chat", %{"msg" => msg}, socket) do
    "chat:" <> room_name = socket.topic
    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)
    
    cond do
      String.length(msg) <= 0 ->
        nil

      String.length(msg) > 250 ->
        push(socket, "chat", %{sender: "sys", name: "System", content: "message must be 250 characters or less"})

      true ->
        ChatAgent.chat(chat, socket, msg)
    end

    {:noreply, socket}
  end

  def handle_in("setname", %{"name" => name}, socket) do
    "chat:" <> room_name = socket.topic
    chat = Grasstube.ProcessRegistry.lookup(room_name, :chat)
    if String.length(name) > 0 and String.length(name) <= @max_name_length do
      newname =
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

      ChatAgent.set_name(chat, socket, newname)
    else
      push(socket, "chat", %{
        id: "sys",
        content: "nickname must be between 1 and #{@max_name_length} characters"
      })
    end

    {:noreply, socket}
  end
end