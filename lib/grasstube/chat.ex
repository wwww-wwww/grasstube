defmodule GrasstubeWeb.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint
  
  alias Grasstube.Repo

  alias Phoenix.HTML

  require Logger
  require AutoLinker

  defstruct admin: "",
            mods: [],
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

      sender = Grasstube.Presence.get_by_key(socket, socket.assigns.user_id)
      
      id = if sender.member, do: sender.username, else: sender.id
      nickname = if sender.member, do: sender.nickname, else: Enum.at(sender.metas, 0).nickname

      add_to_history(channel, nickname, new_msg)
      
      Endpoint.broadcast(socket.topic, "chat", %{sender: id, name: nickname, content: new_msg})
    end

    {:noreply}
  end

  defp is_command?(msg) do
    case String.at(msg, 0) do
      "/" -> true
      _ -> false
    end
  end

  defp command(channel, socket, "op", username) do
    username_lower = username |> String.downcase()
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if get_admin(channel) == user.username do
        if mod_username?(channel, username_lower) or get_admin(channel) == username_lower do
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: username_lower <> " is already an op"})
        else
          add_mod(channel, username_lower)
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "opped " <> username_lower})
        end
      else
        Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
      end
    else
      Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
    end
  end

  defp command(channel, socket, "deop", username) do
    username_lower = username |> String.downcase()
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if get_admin(channel) == user.username do
        if not mod_username?(channel, username_lower) do
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: username_lower <> " is already not an op"})
        else
          remove_mod(channel, username_lower)
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "de-opped " <> username_lower})
        end
      else
        Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
      end
    else
      Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
    end
  end

  defp command(channel, socket, "add_emotelist", username) do
    username_lower = username |> String.downcase()
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if mod?(channel, user) do
        if get_emotelists(channel) |> Enum.member?(username_lower) do
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: username_lower <> " is already in emotelists"})
        else
          add_emotelist(channel, username_lower)
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "added " <> username_lower <> " to emote lists"})
        end
      else
        Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
      end
    else
      Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
    end
  end

  defp command(channel, socket, "remove_emotelist", username) do
    username_lower = username |> String.downcase()
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if mod?(channel, user) do
        if not (get_emotelists(channel) |> Enum.member?(username_lower)) do
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: username_lower <> " is already not in emotelists"})
        else
          remove_emotelist(channel, username_lower)
          Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "removed " <> username_lower <> " from emotelists"})
        end
      else
        Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
      end
    else
      Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
    end
  end

  defp command(channel, socket, cmd, _) do
    command(channel, socket, cmd)
  end

  defp command(channel, socket, "emotelists") do
    Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System",
      content: "emotelists: " <> (get_emotelists(channel) |> Enum.join(", "))})
  end

  defp command(channel, socket, "ops") do
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      user = Guardian.Phoenix.Socket.current_resource(socket)
      if mod?(channel, user) do
        Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System",
          content: "ops: " <> ((get_mods(channel) ++ [get_admin(channel)]) |> Enum.join(", "))})
      else
        Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
      end
    else
      Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: "you can't do this!"})
    end
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

  def add_to_history(pid, nickname, msg) do
    Agent.update(pid, fn val ->
      new_history = [%{name: nickname, msg: msg}] ++ val.history

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

  def remove_emotelist(pid, user) do
    Agent.update(pid, fn val ->
      %{val | emotelists: List.delete(val.emotelists, user)}
    end)
  end

  def add_mod(pid, user) do
    Agent.update(pid, fn val ->
      %{val | mods: [user | val.mods]}
    end)
  end

  def remove_mod(pid, user) do
    Agent.update(pid, fn val ->
      %{val | mods: List.delete(val.mods, user)}
    end)
  end

  def mod_username?(pid, user) do
    get_mods(pid) |> Enum.any?(fn mod -> mod == user end)
  end

  def mod?(pid, user) do
    get_mods(pid) |> Enum.any?(fn mod -> mod == user.username end)
    || get_admin(pid) == user.username
  end

  def room_mod?(room, user) do
    chat = Grasstube.ProcessRegistry.lookup(room, :chat)
    mod?(chat, user)
  end

  def set_name(socket, name) do
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      changeset = Repo.get(Grasstube.User, socket.assigns.user_id)
        |> Ecto.Changeset.change(nickname: name)
      Repo.update(changeset)
    else
      {:ok}
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
