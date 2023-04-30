defmodule Grasstube.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{ProcessRegistry, Repo, Room}

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
    "motd",
    "clear_motd",
    "speed",
    "autopause"
  ]

  defstruct history: [],
            room: nil

  defmodule ChatMessage do
    @derive Jason.Encoder
    defstruct sender: "sys", name: "System", content: ""
  end

  @command_prefix "/"
  @max_message_size 250
  @max_history_size 20
  @max_name_length 24

  def start_link(room) do
    Agent.start_link(fn -> %__MODULE__{room: room} end, name: via_tuple(room.title))
  end

  def via_tuple(room_name), do: ProcessRegistry.via_tuple({room_name, :chat})

  def get(pid), do: Agent.get(pid, & &1)

  defp push({_socket, pid}, event, payload), do: send(pid, %{event: event, payload: payload})

  defp push(socket, event, payload), do: Phoenix.Channel.push(socket, event, payload)

  defp topic({socket, _pid}), do: socket.assigns.topic

  defp topic(socket), do: socket.topic

  defp get_socket({socket, _}), do: socket

  defp get_socket(socket), do: socket

  def get_room(pid), do: Agent.get(pid, & &1.room)

  def set_room(pid, room), do: Agent.update(pid, &%{&1 | room: room})

  def reload_room(%Room{title: title} = room),
    do: ProcessRegistry.lookup(title, :chat) |> reload_room(room)

  def reload_room(pid, room) do
    set_room(
      pid,
      Repo.get(Room, room.id) |> Repo.preload([:user, :mods, [emotelists: :emotes]])
    )
  end

  defp member?(%{assigns: %{user: %Grasstube.User{}}}), do: true

  defp member?(_), do: false

  defp update_presence({socket, pid}, meta) do
    Grasstube.Presence.update(pid, socket.assigns.topic, socket.assigns.user_id, meta)
  end

  defp update_presence(socket, meta) do
    Grasstube.Presence.update(socket, socket.assigns.user_id, meta)
  end

  def chat(channel, socket, @command_prefix <> "!" <> msg) do
    send_chat(channel, socket, "/!" <> msg, false)
  end

  def chat(channel, socket, @command_prefix <> command) do
    room = get_room(channel)

    level =
      cond do
        room.user.username == socket_username(socket) -> :admin
        mod?(room, get_socket(socket).assigns.user) -> :mod
        true -> :user
      end

    String.trim(command)
    |> String.downcase()
    |> command(level, channel, socket)

    {:noreply}
  end

  def chat(channel, socket, msg), do: send_chat(channel, socket, msg)

  defp send_chat(channel, socket, msg, history \\ true) do
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

      if history, do: add_to_history(channel, nickname, new_msg)

      Endpoint.broadcast(topic(socket), "chat", %ChatMessage{
        sender: id,
        name: nickname,
        content: new_msg
      })
    end

    {:noreply}
  end

  defp command("help", level, _channel, socket) do
    commands =
      case level do
        :admin ->
          @public_commands ++ @mod_commands ++ @admin_commands

        :mod ->
          @public_commands ++ @mod_commands

        :user ->
          @public_commands
      end
      |> Enum.map(&("/" <> &1))
      |> Enum.join(" ")

    push(socket, "chat", %ChatMessage{content: "Available commands: #{commands}"})
  end

  defp command("nick " <> nick, _level, _channel, socket) do
    if String.length(nick) > @max_name_length do
      push(socket, "chat", %ChatMessage{
        content: "Nickname must be #{@max_name_length} characters or less"
      })
    else
      if member?(get_socket(socket)) do
        Repo.get(Grasstube.User, get_socket(socket).assigns.user_id)
        |> Ecto.Changeset.change(nickname: nick)
        |> Repo.update()
      end

      update_presence(socket, %{nickname: nick})
    end
  end

  defp command("op " <> username, :admin, channel, socket) do
    username = String.downcase(username)

    case Room.add_mod(get_room(channel), username) do
      :ok ->
        push(socket, "chat", %ChatMessage{content: "opped #{username}"})

      {:error, %{errors: [unique: _]}} ->
        push(socket, "chat", %ChatMessage{content: "#{username} is already an op"})

      err ->
        push(socket, "chat", %ChatMessage{content: inspect(err)})
    end
  end

  defp command("deop " <> username, :admin, channel, socket) do
    username = String.downcase(username)

    Room.remove_mod(get_room(channel), username)
    |> case do
      :ok ->
        push(socket, "chat", %ChatMessage{content: "de-opped #{username}"})

      :fail ->
        push(socket, "chat", %ChatMessage{content: "#{username} is not an op"})
    end
  end

  defp command("add_emotelist " <> username, level, channel, socket)
       when level in [:mod, :admin] do
    username = String.downcase(username)

    case Room.add_emotelist(get_room(channel), username) do
      :ok ->
        push(socket, "chat", %ChatMessage{content: "added #{username} to emote lists"})

      {:error, %{errors: [unique: _]}} ->
        push(socket, "chat", %ChatMessage{content: "#{username} is already in emotelists"})

      err ->
        push(socket, "chat", %ChatMessage{content: inspect(err)})
    end
  end

  defp command("remove_emotelist " <> username, level, channel, socket)
       when level in [:mod, :admin] do
    username = username |> String.downcase()

    Room.remove_emotelist(get_room(channel), username)
    |> case do
      :ok ->
        push(socket, "chat", %ChatMessage{content: "removed #{username} from emotelists"})

      :fail ->
        push(socket, "chat", %ChatMessage{content: "#{username} is not in emotelists"})
    end
  end

  defp command("clear", level, channel, socket) when level in [:mod, :admin] do
    Agent.update(channel, &%{&1 | history: []})

    Endpoint.broadcast(topic(socket), "clear", %{})
  end

  defp command("emotelists", _, channel, socket) do
    push(socket, "chat", %ChatMessage{
      content:
        "emotelists: " <> (get_emotelists(channel) |> Enum.map(& &1.username) |> Enum.join(", "))
    })
  end

  defp command("ops", level, channel, socket) when level in [:mod, :admin] do
    room = get_room(channel)

    push(socket, "chat", %ChatMessage{
      content:
        "ops: " <> ((room.mods ++ [room.user]) |> Enum.map(& &1.username) |> Enum.join(", "))
    })
  end

  defp command("controls", :admin, channel, socket) do
    controls = !public_controls?(channel)
    Room.set_public_controls(get_room(channel), controls)

    if controls do
      push(socket, "chat", %ChatMessage{content: "Controls are now public"})
    else
      push(socket, "chat", %ChatMessage{content: "Controls are now operators-only"})
    end
  end

  defp command("motd", _level, channel, socket) do
    case get_motd(channel) do
      "" -> push(socket, "chat", %ChatMessage{content: "No motd is set"})
      motd -> push(socket, "chat", %ChatMessage{content: motd})
    end
  end

  defp command("motd " <> motd, level, channel, socket) when level in [:mod, :admin] do
    room = get_room(channel)
    Room.set_motd(room, motd)

    push(socket, "chat", %ChatMessage{
      name: room.title,
      content: "Motd set to \"" <> motd <> "\""
    })
  end

  defp command("clear_motd", level, channel, socket) when level in [:mod, :admin] do
    room = get_room(channel)
    Room.set_motd(room, "")

    push(socket, "chat", %ChatMessage{
      name: room.title,
      content: "Motd cleared"
    })
  end

  defp command("speed " <> speed, level, channel, _socket) when level in [:mod, :admin] do
    {speed, _} = Float.parse(speed)

    get_room(channel).title
    |> ProcessRegistry.lookup(:video)
    |> Grasstube.VideoAgent.set_speed(speed)
  end

  defp command("autopause", level, channel, socket) when level in [:mod, :admin] do
    room = get_room(channel)

    room.title
    |> ProcessRegistry.lookup(:video)
    |> Grasstube.VideoAgent.toggle_autopause()
    |> if do
      push(socket, "chat", %ChatMessage{
        name: room.title,
        content: "Autopausing enabled"
      })
    else
      push(socket, "chat", %ChatMessage{
        name: room.title,
        content: "Autopausing disabled"
      })
    end
  end

  defp command(cmd, _level, _channel, socket) do
    push(socket, "chat", %ChatMessage{content: "No command #{cmd}"})
  end

  def get_motd(pid, true) do
    escaped =
      get_motd(pid)
      |> HTML.html_escape()
      |> HTML.safe_to_string()

    do_emote(pid, AutoLinker.link(escaped))
  end

  def get_motd(pid), do: Agent.get(pid, & &1.room.motd)

  def public_controls?(pid), do: Agent.get(pid, & &1.room.public_controls)

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

  def mod?(_, "$" <> _id), do: false

  def mod?(_, nil), do: false

  def mod?(%Room{user: admin, mods: mods}, user) when is_bitstring(user),
    do: admin.username == user or mods |> Enum.any?(&(&1.username == user))

  def mod?(pid, %{username: username}), do: mod?(pid, username)

  def mod?(pid, user), do: mod?(get_room(pid), user)

  def socket_username({socket, _pid}), do: socket_username(socket)

  def socket_username(%{assigns: %{user: "$" <> _}}), do: nil

  def socket_username(%{assigns: %{user: nil}}), do: nil

  def socket_username(%{assigns: %{user: %{username: username}}}), do: username

  defp get_emotelists(pid), do: Agent.get(pid, & &1.room.emotelists)

  def get_emotes(pid) do
    get_emotelists(pid)
    |> Enum.reduce([], fn user, acc ->
      user.emotes
      |> Enum.reduce([], fn emote, acc ->
        url =
          if Application.get_env(:grasstube, :serve_emotes),
            do: GrasstubeWeb.Router.Helpers.user_path(Endpoint, :emote, emote.id),
            else: emote.url

        [%{emote: emote.emote, id: emote.id, url: url} | acc]
      end)
      |> Kernel.++(acc)
    end)
    |> Enum.sort_by(&Map.get(&1, :emote))
  end

  defp do_emote(pid, msg), do: parse_emote(msg, "", get_emotes(pid))

  defp split_emote(msg), do: Regex.split(~r{(:[^:]+:)}, msg, include_captures: true, parts: 2)

  defp process_emote(input, emotes) do
    case Enum.find(emotes, :not_emote, &(String.downcase(input) == ":" <> &1.emote <> ":")) do
      :not_emote ->
        :not_emote

      %{url: url} ->
        Phoenix.HTML.Tag.img_tag(
          url,
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

  def password?(nil), do: false

  def password?(:not_found), do: false

  def password?(pid) do
    Agent.get(pid, & &1.room.password)
    |> case do
      nil -> false
      password -> String.length(password) > 0
    end
  end

  def check_password(pid, password), do: Agent.get(pid, & &1.room.password) == password

  def auth(socket, room_name, password) do
    case ProcessRegistry.lookup(room_name, :chat) do
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

  def get_attr(pid, key) when is_atom(key), do: get_attr(pid, Atom.to_string(key))
  def get_attr(pid, key), do: Agent.get(pid, & &1.room.attributes[key])
end
