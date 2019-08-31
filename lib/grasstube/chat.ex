defmodule GrasstubeWeb.User do
  defstruct id: 0, socket: nil, username: "", nickname: ""
end

defmodule GrasstubeWeb.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.User
  
  alias Grasstube.Repo

  alias Phoenix.HTML

  require Logger
  require AutoLinker

  defstruct admin: "",
            mods: [],
            users: [],   
            history: [],
            room_name: "",
            emotelists: []

  @max_history_size 20

  def start_link(opts) do
    room_name = opts |> Keyword.get(:room_name)
    admin = opts |> Keyword.get(:admin)
    Agent.start_link(fn -> %__MODULE__{room_name: room_name, admin: admin} end, name: via_tuple(room_name))
  end

  def via_tuple(room_name) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :chat})
  end

  def chat(channel, socket, msg) do
    if is_command?(msg) do
      do_command(channel, socket, msg)
    else
      escaped =
        msg
        |> HTML.html_escape()
        |> HTML.safe_to_string()
      
      new_msg = do_emote(channel, AutoLinker.link(escaped))

      add_to_history(channel, socket.id, new_msg)
      sender = get_user(channel, socket.id)
      
      Endpoint.broadcast(socket.topic, "chat", %{sender: sender.username, name: sender.nickname, content: new_msg})
    end

    {:noreply}
  end

  defp is_command?(msg) do
    case String.at(msg, 0) do
      "/" -> true
      _ -> false
    end
  end

  defp command(channel, socket, cmd, _) do
    command(channel, socket, cmd)
  end

  defp command(_channel, socket, cmd) do
    Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "no command " <> cmd})
  end

  defp do_command(channel, socket, msg) do
    case Regex.run(~r/\/([^ ]+)(?: (.+))?/, msg) do
      [_, cmd] ->
        command(channel, socket, cmd)

      [_, cmd, args] ->
        command(channel, socket, cmd, args)

      nil ->
        nil
    end
  end

  def add_to_history(pid, id, msg) do
    Agent.update(pid, fn val ->
      user = val.users |> Enum.find(:not_found, fn user -> user.id == id end)
      new_history = [%{name: user.nickname, msg: msg}] ++ val.history

      if length(new_history) > @max_history_size do
        %{val | history: new_history |> Enum.reverse() |> tl() |> Enum.reverse()}
      else
        %{val | history: new_history}
      end
    end)
  end

  def get_history(pid) do
    Agent.get(pid, fn val -> val.history end)
  end

  def get_users(pid) do
    Agent.get(pid, fn val -> val.users end)
  end

  def get_admin(pid) do
    Agent.get(pid, fn val -> val.admin end)
  end

  def get_mods(pid) do
    Agent.get(pid, fn val -> val.mods end)
  end

  def add_emotelist(pid, user) do
    Agent.update(pid, fn val ->
      %{val | emotelists: [user | val.emotelists]}
    end)
  end

  def add_mod(pid, user) do
    Agent.update(pid, fn val ->
      %{val | mods: [user | val.mods]}
    end)
  end

  def remove_mod(pid, user) do
    Agent.update(pid, fn val ->
      %{val | mods: List.delete(val.mods, user.username)}
    end)
  end

  def mod?(pid, user) do
    get_mods(pid) |> Enum.any?(fn mod -> mod == user.username end)
    || get_admin(pid) == user.username
  end

  def room_mod?(room, user) do
    chat = Grasstube.ProcessRegistry.lookup(room, :chat)
    mod?(chat, user)
  end

  def get_user(pid, id) do
    get_users(pid) |> Enum.find(:not_found, fn user -> user.id == id end)
  end

  def add_user(pid, user) do
    Agent.update(pid, fn val -> %{val | users: val.users ++ [user]} end)
  end

  def remove_user(pid, id) do
    Agent.update(pid, fn val ->
      case val.users |> Enum.find(:not_found, fn user -> user.id == id end) do
        :not_found -> val
        user = %User{} -> %{val | users: List.delete(val.users, user)}
      end
    end)
  end

  def get_userlist(pid) do
    get_users(pid)
    |> Enum.map(fn user ->
      %{
        username: user.username,
        nickname: user.nickname,
        mod: mod?(pid, user)
      }
    end)
  end

  def update_name(pid, socket, name) do
    Agent.update(pid, fn val ->
      new_users =
        Enum.map(val.users, fn user ->
          cond do
            user.id == socket.id ->
              %User{user | nickname: name}

            true ->
              user
          end
        end)

      %{val | users: new_users}
    end)
  end

  def set_name(pid, socket, name) do
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      changeset = Repo.get(Grasstube.User, user.username)
        |> Ecto.Changeset.change(nickname: name)
      case Repo.update(changeset) do
        {:ok, _} ->
          update_name(pid, socket, name)
          Endpoint.broadcast(socket.topic, "userlist", %{list: get_userlist(pid)})
        {:error, changeset} ->
          IO.inspect(changeset)
      end
    else
      update_name(pid, socket, name)
      Endpoint.broadcast(socket.topic, "userlist", %{list: get_userlist(pid)})
    end
  end

  defp get_emotelists(pid) do
    Agent.get(pid, fn val -> val.emotelists end)
  end

  def get_emotes(pid) do
    get_emotelists(pid) |> Enum.reduce([], fn username, acc ->
      user = Repo.get(Grasstube.User, username) |> Repo.preload(:emotes)
      emotes = user.emotes |> Enum.reduce([], fn emote, acc -> [%{emote: emote.emote, url: emote.url} | acc] end)
      emotes ++ acc
    end)
  end

  defp do_emote(pid, msg) do
    emotes = get_emotes(pid)
    parse_emote(msg, "", emotes)
  end

  defp split_emote(msg) do
    Regex.split(~r{(?<t>:[^:]+:)}, msg, include_captures: true, on: [:t], parts: 2)
  end

  defp process_emote(input, emotes) do
    case emotes |> Enum.find(:not_emote, fn emote -> String.downcase(input) == ":" <> emote.emote <> ":" end) do
      :not_emote -> :not_emote
      emote -> Phoenix.HTML.Tag.img_tag(emote.url, alt: String.downcase(input), title: String.downcase(input)) |> Phoenix.HTML.safe_to_string()
    end
  end

  defp parse_emote(msg, acc, emotes) do
    case split_emote(msg) do
      [_] ->
        acc <> msg

      [before | [emote | [tail]]] ->
        case process_emote(emote, emotes) do
          :not_emote ->
            parse_emote(":" <> tail, acc <> before <> String.slice(emote, 0..-2), emotes)

          emote_html ->
            parse_emote(tail, acc <> before <> emote_html, emotes)
        end
    end
  end
end
