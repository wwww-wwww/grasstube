defmodule GrasstubeWeb.User do
  defstruct id: 0, socket: nil, name: ""
end

defmodule GrasstubeWeb.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint
  alias GrasstubeWeb.User
  
  alias Phoenix.HTML

  require Logger
  require AutoLinker

  defstruct users: [],
            mods: [],
            history: [],
            room_name: ""

  @control_password "523"
  @max_history_size 20

  def start_link(opts) do
    Logger.info("Starting chat agent.")
    [room_name: room_name] ++ _ = opts
    Agent.start_link(fn -> %__MODULE__{room_name: room_name} end, name: via_tuple(room_name))
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
      
      new_msg = AutoLinker.link(escaped) |> do_emote()

      add_to_history(channel, socket.id, new_msg)
      
      Endpoint.broadcast(socket.topic, "chat", %{id: socket.id, content: new_msg})
    end

    {:noreply}
  end

  defp is_command?(msg) do
    case String.at(msg, 0) do
      "/" -> true
      _ -> false
    end
  end

  defp command(channel, socket, "controls", pass) do
    if pass == @control_password do
      set_mod(channel, socket.id)
      Endpoint.broadcast(socket.topic, "userlist", %{list: get_userlist(channel)})
      Phoenix.Channel.push(socket, "controls", %{})
    end
  end

  defp command(channel, socket, cmd, _) do
    command(channel, socket, cmd)
  end

  defp command(_channel, socket, cmd) do
    Phoenix.Channel.push(socket, "chat", %{id: "sys", content: "no command " <> cmd})
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
      new_history = [%{name: user.name, msg: msg}] ++ val.history

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

  def get_mods(pid) do
    Agent.get(pid, fn val -> val.mods end)
  end

  def set_mod(pid, id) do
    Agent.update(pid, fn val ->
      %{val | mods: val.mods ++ [id]}
    end)
  end

  def mod?(room, id) do
    chat = Grasstube.ProcessRegistry.lookup(room, :chat)
    get_mods(chat) |> Enum.any?(fn mod -> mod == id end)
  end

  def flush_mods(pid) do
    Agent.update(pid, fn val ->
      new_mods =
        val.mods
        |> Enum.filter(fn id ->
          Enum.any?(val.users, fn user -> user.id == id end)
        end)

      %{val | mods: new_mods}
    end)
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
    mods = get_mods(pid)

    get_users(pid)
    |> Enum.map(fn user ->
      %{
        id: user.id,
        name: user.name,
        mod: Enum.find(mods, false, fn mod -> mod == user.id end)
      }
    end)
  end

  def set_name(pid, id, name) do
    Agent.update(pid, fn val ->
      new_users =
        Enum.map(val.users, fn user ->
          cond do
            user.id == id ->
              %User{user | name: name}

            true ->
              user
          end
        end)

      %{val | users: new_users}
    end)
  end

  defp get_emotes() do
    with {:ok, body} <- File.read("/home/w/grasstube/emotes.json"),
          json <- Jason.decode!(body),
          do: json
  end

  defp do_emote(msg) do
    emotes = get_emotes()
    parse_emote(msg, "", emotes)
  end

  defp split_emote(msg) do
    Regex.split(~r{(?<t>:[^:]+:)}, msg, include_captures: true, on: [:t], parts: 2)
  end

  defp process_emote(input, emotes) do
    case emotes |> Map.fetch(String.downcase(input)) do
      {:ok, emote} -> "<img src=\"" <> emote <> "\" alt=\"" <> String.downcase(input) <> "\" title=\"" <> String.downcase(input) <> "\">"
      :error -> :not_emote
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
