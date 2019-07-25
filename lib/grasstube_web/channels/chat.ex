defmodule GrasstubeWeb.ChatChannel do
  use Phoenix.Channel
  require Logger

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.ChatAgent
  alias GrasstubeWeb.User

  @max_name_length 24
  
  def join("chat:0", _message, socket) do
    :ok = ChannelWatcher.monitor(:rooms, self(), {__MODULE__, :leave, [socket.id]})

    user = %User{id: socket.id, socket: socket, name: "anon#{socket.id}"}
    ChatAgent.add_user(user)

    send(self(), {:after_join, nil})
    {:ok, socket}
  end

  def handle_info({:after_join, _}, socket) do
    push(socket, "id", %{"id" => socket.id})
    Endpoint.broadcast("chat:0", "userlist", %{list: ChatAgent.get_userlist()})

    history = ChatAgent.get_history()
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
  
  def leave(user_id) do
    case ChatAgent.get_user(user_id) do
      :not_found ->
        nil

      _ ->
        ChatAgent.remove_user(user_id)
        Logger.info(user_id <> " left")
        ChatAgent.flush_mods()
        Endpoint.broadcast("chat:0", "userlist", %{list: ChatAgent.get_userlist()})
    end
  end
  
  def handle_in("chat", %{"msg" => msg}, socket) do
    cond do
      String.length(msg) <= 0 ->
        nil

      String.length(msg) > 250 ->
        push(socket, "chat", %{id: "sys", content: "message must be 250 characters or less"})

      true ->
        ChatAgent.chat(socket, msg)
    end

    {:noreply, socket}
  end

  def handle_in("setname", %{"name" => name}, socket) do
    if String.length(name) > 0 and String.length(name) <= @max_name_length do
      newname =
        cond do
          String.downcase(name) == "anon" ->
            "anon#{socket.id}"

            ChatAgent.get_users()
          |> Enum.any?(fn s -> String.downcase(s.name) == String.downcase(name) end) ->
            name <> "0"

          true ->
            name
        end

      ChatAgent.set_name(socket.id, newname)
      Endpoint.broadcast("chat:0", "userlist", %{list: ChatAgent.get_userlist()})
    else
      push(socket, "chat", %{
        id: "sys",
        content: "name must be between 1 and #{@max_name_length} characters"
      })
    end

    {:noreply, socket}
  end
end