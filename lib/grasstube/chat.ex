defmodule Grasstube.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{ProcessRegistry, Repo}

  alias Phoenix.HTML

  require Logger
  require AutoLinker

  @public_commands ["help", "nick", "emotelists"]
  @admin_commands [
    "op",
    "deop",
    "controls"
  ]
  @mod_commands [
    "add_emotelist",
    "remove_emotelist",
    "clear",
    "ops",
    "clear_motd"
  ]

  defstruct admin: "",
            password: "",
            mods: [],
            history: [],
            room_name: "",
            emotelists: [],
            motd: "",
            public_controls: false,
            scripts: %{}

  defmodule ChatMessage do
    @derive Jason.Encoder
    defstruct sender: "sys", name: "System", content: ""
  end

  @max_message_size 250
  @max_history_size 20
  @max_name_length 24

  def start_link(opts) do
    room_name = Keyword.get(opts, :room_name)
    admin = Keyword.get(opts, :admin)
    password = Keyword.get(opts, :password)

    Agent.start_link(
      fn -> %__MODULE__{room_name: room_name, admin: admin, password: password} end,
      name: via_tuple(room_name)
    )
  end

  def via_tuple(room_name), do: ProcessRegistry.via_tuple({room_name, :chat})

  def get(pid), do: Agent.get(pid, & &1)

  defp push({_socket, pid}, event, payload), do: send(pid, %{event: event, payload: payload})

  defp push(socket, event, payload), do: Phoenix.Channel.push(socket, event, payload)

  defp topic({socket, _pid}), do: socket.assigns.topic

  defp topic(socket), do: socket.topic

  defp get_socket({socket, _}), do: socket

  defp get_socket(socket), do: socket

  defp update_presence({socket, pid}, meta) do
    Grasstube.Presence.update(pid, socket.assigns.topic, socket.assigns.user_id, meta)
  end

  defp update_presence(socket, meta) do
    Grasstube.Presence.update(socket, socket.assigns.user_id, meta)
  end

  def chat(channel, socket, msg) do
    if is_command?(String.trim(msg)) do
      "/" <> command = String.trim(msg)
      command_name = command |> String.split() |> Enum.at(0) |> String.downcase()

      cond do
        command_name in @admin_commands ->
          if get_admin(channel) == socket_username(socket) do
            command(channel, socket, command)
          else
            push(socket, "chat", %ChatMessage{content: "You can't do this!"})
          end

        command_name in @mod_commands ->
          if mod?(channel, get_socket(socket).assigns.user) do
            command(channel, socket, command)
          else
            push(socket, "chat", %ChatMessage{content: "You can't do this!"})
          end

        true ->
          command(channel, socket, command)
      end
    else
      if String.length(msg) > @max_message_size do
        push(socket, "chat", %ChatMessage{
          content: "message must be #{@max_message_size} characters or less"
        })
      else
        escaped =
          msg
          |> HTML.html_escape()
          |> HTML.safe_to_string()

        new_msg = do_emote(channel, AutoLinker.link(escaped))

        sender = Grasstube.Presence.get_by_key(topic(socket), get_socket(socket).assigns.user_id)

        id = if sender.member, do: sender.username, else: sender.id
        nickname = if sender.member, do: sender.nickname, else: Enum.at(sender.metas, 0).nickname

        add_to_history(channel, nickname, new_msg)

        Endpoint.broadcast(topic(socket), "chat", %ChatMessage{
          sender: id,
          name: nickname,
          content: new_msg
        })
      end
    end

    {:noreply}
  end

  defp is_command?(msg) do
    case String.at(msg, 0) do
      "/" -> true
      _ -> false
    end
  end

  defp command(channel, socket, "help") do
    commands =
      cond do
        get_admin(channel) == socket_username(socket) ->
          @public_commands ++ @mod_commands ++ @admin_commands

        mod?(channel, get_socket(socket).assigns.user) ->
          @public_commands ++ @mod_commands

        true ->
          @public_commands
      end
      |> Enum.map(&("/" <> &1))
      |> Enum.join(" ")

    push(socket, "chat", %ChatMessage{content: "Available commands: #{commands}"})
  end

  defp command(_channel, socket, "nick " <> nick) do
    if String.length(nick) > @max_name_length do
      push(socket, "chat", %ChatMessage{
        content: "Nickname must be #{@max_name_length} characters or less"
      })
    else
      if not is_nil(get_socket(socket).assigns.user) do
        Repo.get(Grasstube.User, get_socket(socket).assigns.user_id)
        |> Ecto.Changeset.change(nickname: nick)
        |> Repo.update()
      end

      update_presence(socket, %{nickname: nick})
    end
  end

  defp command(channel, socket, "op " <> username) do
    username = String.downcase(username)

    if mod?(channel, username) or get_admin(channel) == username do
      push(socket, "chat", %ChatMessage{content: "#{username} is already an op"})
    else
      add_mod(channel, username)

      push(socket, "chat", %ChatMessage{content: "opped #{username}"})
    end
  end

  defp command(channel, socket, "deop " <> username) do
    username = String.downcase(username)

    if not mod?(channel, username) do
      push(socket, "chat", %ChatMessage{content: "#{username} is already not an op"})
    else
      remove_mod(channel, username)

      push(socket, "chat", %ChatMessage{content: "de-opped #{username}"})
    end
  end

  defp command(channel, socket, "add_emotelist " <> username) do
    username = String.downcase(username)

    if get_emotelists(channel) |> Enum.member?(username) do
      push(socket, "chat", %ChatMessage{
        content: "#{username} is already in emotelists"
      })
    else
      add_emotelist(channel, username)

      push(socket, "chat", %ChatMessage{
        content: "added #{username} to emote lists"
      })
    end
  end

  defp command(channel, socket, "remove_emotelist " <> username) do
    username = username |> String.downcase()

    if not (get_emotelists(channel) |> Enum.member?(username)) do
      push(socket, "chat", %ChatMessage{
        content: "#{username} is already not in emotelists"
      })
    else
      remove_emotelist(channel, username)

      push(socket, "chat", %ChatMessage{
        content: "removed #{username} from emotelists"
      })
    end
  end

  defp command(channel, socket, "clear") do
    Agent.update(channel, &%{&1 | history: []})

    Endpoint.broadcast(topic(socket), "clear", %{})
  end

  defp command(channel, socket, "emotelists") do
    push(socket, "chat", %ChatMessage{
      content: "emotelists: " <> (get_emotelists(channel) |> Enum.join(", "))
    })
  end

  defp command(channel, socket, "ops") do
    push(socket, "chat", %ChatMessage{
      content: "ops: " <> ((get_mods(channel) ++ [get_admin(channel)]) |> Enum.join(", "))
    })
  end

  defp command(channel, socket, "controls") do
    set_public_controls(channel, !public_controls?(channel))

    if public_controls?(channel) do
      push(socket, "chat", %ChatMessage{content: "Controls are now public"})
    else
      push(socket, "chat", %ChatMessage{content: "Controls are now operators-only"})
    end
  end

  defp command(channel, socket, "motd") do
    case get_motd(channel) do
      "" -> push(socket, "chat", %ChatMessage{content: "No motd is set"})
      motd -> push(socket, "chat", %ChatMessage{content: motd})
    end
  end

  defp command(channel, socket, "motd " <> motd) do
    set_motd(channel, motd)

    push(socket, "chat", %ChatMessage{
      name: get_room_name(channel),
      content: "Motd set to \"" <> motd <> "\""
    })
  end

  defp command(channel, socket, "clear_motd") do
    set_motd(channel, "")

    push(socket, "chat", %ChatMessage{
      name: get_room_name(channel),
      content: "Motd cleared"
    })
  end

  defp command(_channel, socket, cmd) do
    push(socket, "chat", %ChatMessage{content: "No command #{cmd}"})
  end

  def get_room_name(pid), do: Agent.get(pid, & &1.room_name)

  def get_motd(pid), do: Agent.get(pid, & &1.motd)

  def set_motd(pid, motd), do: Agent.update(pid, &%{&1 | motd: motd})

  def set_public_controls(pid, public_controls) do
    Agent.update(pid, &%{&1 | public_controls: public_controls})

    Endpoint.broadcast("video:#{get_room_name(pid)}", "controls", %{})
    Endpoint.broadcast("playlist:#{get_room_name(pid)}", "controls", %{})
    Endpoint.broadcast("polls:#{get_room_name(pid)}", "controls", %{})
    Endpoint.broadcast(inspect(pid), "details", %{})
  end

  def public_controls?(pid), do: Agent.get(pid, & &1.public_controls)

  def controls_user?(pid, user), do: public_controls?(pid) or mod?(pid, user)

  def controls?(pid, %{assigns: %{user: user}}), do: controls?(pid, user)

  def controls?(pid, user), do: public_controls?(pid) or mod?(pid, user)

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

  def get_history(pid), do: Agent.get(pid, & &1.history)

  def get_admin(pid), do: Agent.get(pid, & &1.admin)

  def get_mods(pid), do: Agent.get(pid, & &1.mods)

  def add_emotelist(pid, user) do
    Agent.update(pid, &%{&1 | emotelists: [user | &1.emotelists]})
    Endpoint.broadcast(inspect(pid), "details", %{})
  end

  def remove_emotelist(pid, user) do
    Agent.update(pid, &%{&1 | emotelists: List.delete(&1.emotelists, user)})
    Endpoint.broadcast(inspect(pid), "details", %{})
  end

  def broadcast_mod(pid, user) do
    is_mod = mod?(pid, user)
    room_name = get_room_name(pid)

    Endpoint.broadcast("user:#{room_name}:#{user}", "presence", %{
      mod: is_mod
    })

    controls = if is_mod, do: "controls", else: "revoke_controls"
    Endpoint.broadcast("user:#{room_name}:#{user}", controls, %{})

    Endpoint.broadcast(inspect(pid), "details", %{})
  end

  def add_mod(pid, user) do
    Agent.update(pid, &%{&1 | mods: [user | &1.mods]})
    broadcast_mod(pid, user)
  end

  def remove_mod(pid, user) do
    Agent.update(pid, &%{&1 | mods: List.delete(&1.mods, user)})
    broadcast_mod(pid, user)
  end

  def mod?(pid, user) when is_bitstring(user), do: get_mods(pid) |> Enum.any?(&(&1 == user))

  def mod?(pid, %{username: username}) when is_bitstring(username),
    do:
      get_admin(pid) == username or
        get_mods(pid) |> Enum.any?(&(&1 == username))

  def mod?(_, _), do: false

  def socket_username({socket, _pid}) do
    socket_username(socket)
  end

  def socket_username(%{assigns: %{user: nil}}), do: nil

  def socket_username(%{assigns: %{user: %{username: username}}}), do: username

  defp get_emotelists(pid), do: Agent.get(pid, & &1.emotelists)

  def get_emotes(pid) do
    get_emotelists(pid)
    |> Enum.reduce([], fn username, acc ->
      Repo.get(Grasstube.User, username)
      |> Repo.preload(:emotes)
      |> Map.get(:emotes)
      |> Enum.reduce([], fn emote, acc -> [%{emote: emote.emote, url: emote.url} | acc] end)
      |> Kernel.++(acc)
    end)
    |> Enum.sort_by(&Map.get(&1, :emote))
  end

  defp do_emote(pid, msg), do: parse_emote(msg, "", get_emotes(pid))

  defp split_emote(msg), do: Regex.split(~r{(:[^:]+:)}, msg, include_captures: true, parts: 2)

  defp process_emote(input, emotes) do
    case emotes
         |> Enum.find(:not_emote, &(String.downcase(input) == ":" <> &1.emote <> ":")) do
      :not_emote ->
        :not_emote

      emote ->
        Phoenix.HTML.Tag.img_tag(emote.url,
          alt: String.downcase(input),
          title: String.downcase(input)
        )
        |> Phoenix.HTML.safe_to_string()
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

  def set_password(pid, password) do
    Agent.update(pid, &%{&1 | password: password})
    Endpoint.broadcast(inspect(pid), "details", %{})
    GrasstubeWeb.RoomsLive.update()
  end

  def password?(pid) do
    Agent.get(pid, & &1.password)
    |> String.length()
    |> Kernel.>(0)
  end

  def check_password(pid, password), do: Agent.get(pid, & &1.password) == password

  def auth(socket, room_name, password) do
    case Grasstube.ProcessRegistry.lookup(room_name, :chat) do
      :not_found ->
        {:error, "no room"}

      chat ->
        if not password?(chat) or check_password(chat, password) do
          {:ok, socket}
        else
          if mod?(chat, socket.assigns.user) do
            {:ok, socket}
          else
            {:error, "bad password"}
          end
        end
    end
  end

  def get_script(pid, key), do: Agent.get(pid, & &1.scripts[key])

  def set_script(pid, key, value),
    do: Agent.update(pid, &%{&1 | scripts: Map.put(&1.scripts, key, value)})

  def remove_script(pid, key),
    do: Agent.update(pid, &%{&1 | scripts: Map.delete(&1.scripts, key)})
end
