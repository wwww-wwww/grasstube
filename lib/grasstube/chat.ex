defmodule Grasstube.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{ProcessRegistry, Repo}
  alias Guardian.Phoenix.Socket

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
            public_controls: false

  @max_history_size 20

  def start_link(opts) do
    room_name = opts |> Keyword.get(:room_name)
    admin = opts |> Keyword.get(:admin)
    password = opts |> Keyword.get(:password)

    Agent.start_link(
      fn -> %__MODULE__{room_name: room_name, admin: admin, password: password} end,
      name: via_tuple(room_name)
    )
  end

  def via_tuple(room_name), do: ProcessRegistry.via_tuple({room_name, :chat})

  def chat2(room, user_id, user, msg) do
    escaped =
      msg
      |> HTML.html_escape()
      |> HTML.safe_to_string()

    channel = ProcessRegistry.lookup(room, :chat)

    new_msg = do_emote(channel, AutoLinker.link(escaped))

    id = if user, do: user.username, else: user_id
    # Enum.at(user.metas, 0).nickname
    nickname = if user, do: user.nickname, else: user_id

    add_to_history(channel, nickname, new_msg)
    Endpoint.broadcast("chat:" <> room, "chat", %{sender: id, name: nickname, content: new_msg})
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
            Phoenix.Channel.push(socket, "chat", %{
              sender: "sys",
              name: "System",
              content: "You can't do this!"
            })
          end

        command_name in @mod_commands ->
          if mod?(channel, socket.assigns.user) do
            command(channel, socket, command)
          else
            Phoenix.Channel.push(socket, "chat", %{
              sender: "sys",
              name: "System",
              content: "You can't do this!"
            })
          end

        true ->
          command(channel, socket, command)
      end
    else
      if String.length(msg) > 250 do
        Phoenix.Channel.push(socket, "chat", %{
          sender: "sys",
          name: "System",
          content: "message must be 250 characters or less"
        })
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

        mod?(channel, socket.assigns.user) ->
          @public_commands ++ @mod_commands

        true ->
          @public_commands
      end
      |> Enum.map(&("/" <> &1))

    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: "System",
      content: "Available commands: " <> Enum.join(commands, " ")
    })
  end

  defp command(_channel, socket, "nick " <> nick) do
    if Socket.authenticated?(socket) do
      Repo.get(Grasstube.User, socket.assigns.user_id)
      |> Ecto.Changeset.change(nickname: nick)
      |> Repo.update()
    end

    Grasstube.Presence.update(socket, socket.assigns.user_id, %{nickname: nick})
  end

  defp command(channel, socket, "op " <> username) do
    username_lower = username |> String.downcase()

    if mod_username?(channel, username_lower) or get_admin(channel) == username_lower do
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: username_lower <> " is already an op"
      })
    else
      add_mod(channel, username_lower)

      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "opped " <> username_lower
      })

      Endpoint.broadcast("user:#{get_room_name(channel)}:#{username_lower}", "presence", %{
        mod: true
      })

      Endpoint.broadcast("user:#{get_room_name(channel)}:#{username_lower}", "controls", %{})
    end
  end

  defp command(channel, socket, "deop " <> username) do
    username_lower = username |> String.downcase()

    if not mod_username?(channel, username_lower) do
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: username_lower <> " is already not an op"
      })
    else
      remove_mod(channel, username_lower)

      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "de-opped " <> username_lower
      })

      Endpoint.broadcast("user:#{get_room_name(channel)}:#{username_lower}", "presence", %{
        mod: false
      })

      Endpoint.broadcast(
        "user:#{get_room_name(channel)}:#{username_lower}",
        "revoke_controls",
        %{}
      )
    end
  end

  defp command(channel, socket, "add_emotelist " <> username) do
    username_lower = username |> String.downcase()

    if get_emotelists(channel) |> Enum.member?(username_lower) do
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: username_lower <> " is already in emotelists"
      })
    else
      add_emotelist(channel, username_lower)

      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "added " <> username_lower <> " to emote lists"
      })
    end
  end

  defp command(channel, socket, "remove_emotelist " <> username) do
    username_lower = username |> String.downcase()

    if not (get_emotelists(channel) |> Enum.member?(username_lower)) do
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: username_lower <> " is already not in emotelists"
      })
    else
      remove_emotelist(channel, username_lower)

      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "removed " <> username_lower <> " from emotelists"
      })
    end
  end

  defp command(channel, socket, "clear") do
    Agent.update(channel, &%{&1 | history: []})

    Endpoint.broadcast(socket.topic, "clear", %{})
  end

  defp command(channel, socket, "emotelists") do
    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: "System",
      content: "emotelists: " <> (get_emotelists(channel) |> Enum.join(", "))
    })
  end

  defp command(channel, socket, "ops") do
    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: "System",
      content: "ops: " <> ((get_mods(channel) ++ [get_admin(channel)]) |> Enum.join(", "))
    })
  end

  defp command(channel, socket, "controls") do
    Agent.update(channel, &%{&1 | public_controls: !&1.public_controls})

    controls = public_controls?(channel)

    if controls do
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "Controls are now public"
      })
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "Controls are now operators-only"
      })
    end
  end

  defp command(channel, socket, "motd") do
    motd = get_motd(channel)

    if String.length(motd) > 0 do
      Phoenix.Channel.push(socket, "chat", %{sender: "sys", name: "System", content: motd})
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "No motd is set"
      })
    end
  end

  defp command(channel, socket, "motd " <> motd) do
    Agent.update(channel, &%{&1 | motd: motd})

    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: get_room_name(channel),
      content: "Motd set to \"" <> motd <> "\""
    })
  end

  defp command(channel, socket, "clear_motd") do
    Agent.update(channel, &%{&1 | motd: ""})

    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: get_room_name(channel),
      content: "Motd cleared"
    })
  end

  defp command(_channel, socket, cmd) do
    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: "System",
      content: "No command " <> cmd
    })
  end

  def get_room_name(pid), do: Agent.get(pid, & &1.room_name)

  def get_motd(pid), do: Agent.get(pid, & &1.motd)

  def public_controls?(pid), do: Agent.get(pid, & &1.public_controls)

  def controls_user?(pid, user), do: public_controls?(pid) or mod?(pid, user)

  def controls?(pid, socket), do: public_controls?(pid) or mod?(pid, socket.assigns.user)

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

  def add_emotelist(pid, user), do: Agent.update(pid, &%{&1 | emotelists: [user | &1.emotelists]})

  def remove_emotelist(pid, user),
    do: Agent.update(pid, &%{&1 | emotelists: List.delete(&1.emotelists, user)})

  def add_mod(pid, user), do: Agent.update(pid, &%{&1 | mods: [user | &1.mods]})

  def remove_mod(pid, user), do: Agent.update(pid, &%{&1 | mods: List.delete(&1.mods, user)})

  def mod_username?(pid, user), do: get_mods(pid) |> Enum.any?(&(&1 == user))

  def mod?(pid, user) when not is_nil(user),
    do:
      get_admin(pid) == user.username or
        get_mods(pid) |> Enum.any?(&(&1 == user.username))

  def mod?(_, _), do: false

  def socket_username(socket) do
    if socket.assigns.user != nil do
      socket.assigns.user.username
    else
      nil
    end
  end

  def set_name(socket, name) do
    if Socket.authenticated?(socket) do
      Repo.get(Grasstube.User, socket.assigns.user_id)
      |> Ecto.Changeset.change(nickname: name)
      |> Repo.update()
    else
      {:ok}
    end
  end

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
  end

  defp do_emote(pid, msg) do
    emotes = get_emotes(pid)
    parse_emote(msg, "", emotes)
  end

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
end
