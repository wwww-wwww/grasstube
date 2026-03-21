defmodule Grasstube.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint

  alias Grasstube.{ProcessRegistry, Repo, Room, VideoAgent, RoomAgent}

  alias Phoenix.HTML

  require Logger
  require AutoLinker

  @public_commands ["help", "nick", "emotelists", "ready"]
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
    "speed",
    "autopause",
    "untrack"
  ]

  defstruct room_id: nil,
            history: [],
            last_ready: nil,
            ready_members: %{}

  defmodule ChatMessage do
    @derive Jason.Encoder
    defstruct sender: "sys", name: "System", content: "", extra_data: nil
  end

  @command_prefix "/"
  @max_message_size 250
  @max_history_size 20
  @max_name_length 24

  def start_link(room) do
    Agent.start_link(fn -> %__MODULE__{room: room} end,
      name: Grasstube.ProcessRegistry.via_tuple(__MODULE__, room.id)
    )
  end

  def get(pid), do: Agent.get(pid, & &1)

  defp push({_socket, pid}, event, payload), do: send(pid, %{event: event, payload: payload})

  defp push(socket, event, payload), do: Phoenix.Channel.push(socket, event, payload)

  defp topic({socket, _pid}), do: socket.assigns.topic

  defp topic(socket), do: socket.topic

  defp get_socket({socket, _}), do: socket

  defp get_socket(socket), do: socket

  def reload_room(room) do
    ProcessRegistry.lookup(room.id, __MODULE__)
    |> Agent.update(fn state ->
      new_room = Repo.get(Room, room.id) |> Repo.preload([:user, :mods, [emotelists: :emotes]])
      %{state | room: new_room}
    end)
  end

  defp member?(%{assigns: %{user: %Grasstube.User{}}}), do: true

  defp member?(_), do: false

  defp update_presence({socket, pid}, meta) do
    Grasstube.Presence.update(pid, socket.assigns.topic, socket.assigns.user_id, meta)
  end

  defp update_presence(socket, meta) do
    Grasstube.Presence.update(socket, socket.assigns.user_id, meta)
  end

  def chat(pid, socket, @command_prefix <> "!" <> msg) do
    send_chat(pid, socket, "/!" <> msg, false)
  end

  def chat(pid, socket, @command_prefix <> command) do
    # chat = get(pid)
    # room = Grasstube.ProcessRegistry.get(chat.room_id, Grasstube.RoomAgent)

    # level = :user
    # cond do
    #   room.user.username == socket_username(socket) -> :admin
    #   mod?(room, get_socket(socket).assigns.user) -> :mod
    #   true -> :user
    # end

    # command(room, level, chat, socket)
    # String.trim(command)
    # |> String.downcase()
    # |> command(level, pid, socket)

    {:noreply}
  end

  def chat(pid, socket, msg), do: send_chat(pid, socket, msg)

  defp send_chat(pid, socket, msg, history \\ true) do
    if String.length(msg) > @max_message_size do
      push(socket, "chat", %ChatMessage{
        content: "message must be #{@max_message_size} characters or less"
      })
    else
      escaped =
        msg
        |> HTML.html_escape()
        |> HTML.safe_to_string()

      chat = ChatAgent.get(pid)
      room_pid = Grasstube.ProcessRegistry.get(chat.room_id, Grasstube.RoomAgent)
      emotes =  Grasstube.RoomAgent.emotes(room_pid)

      new_msg = parse_emote(AutoLinker.link(escaped), "", emotes)

      sender = Grasstube.Presence.get_by_key(topic(socket), get_socket(socket).assigns.user_id)

      id = if sender.member, do: sender.username, else: sender.id
      nickname = if sender.member, do: sender.nickname, else: Enum.at(sender.metas, 0).nickname

      if history, do: add_to_history(pid, nickname, new_msg)

      Endpoint.broadcast(topic(socket), "chat", %ChatMessage{
        sender: id,
        name: nickname,
        content: new_msg
      })
    end

    {:noreply}
  end

  defp command("help", level, room, socket) do
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

  defp command("nick " <> nick, level, room, socket) do
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

  defp command("op " <> username, :admin, room, socket) do
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

  defp command("deop " <> username, :admin, room, socket) do
    username = String.downcase(username)

    case Room.remove_mod(get_room(channel), username) do
      :ok ->
        push(socket, "chat", %ChatMessage{content: "de-opped #{username}"})

      :fail ->
        push(socket, "chat", %ChatMessage{content: "#{username} is not an op"})
    end
  end

  defp command("add_emotelist " <> username, room, socket)
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

  defp command("remove_emotelist " <> username, room, socket)
       when level in [:mod, :admin] do
    username = username |> String.downcase()

    case Room.remove_emotelist(get_room(channel), username) do
      :ok ->
        push(socket, "chat", %ChatMessage{content: "removed #{username} from emotelists"})

      :fail ->
        push(socket, "chat", %ChatMessage{content: "#{username} is not in emotelists"})
    end
  end

  defp command("clear", level, room, socket) when level in [:mod, :admin] do
    Agent.update(channel, &%{&1 | history: []})

    Endpoint.broadcast(topic(socket), "clear", %{})
  end

  defp command("emotelists", _, channel, socket) do
    push(socket, "chat", %ChatMessage{
      content:
        "emotelists: " <> (get_emotelists(channel) |> Enum.map(& &1.username) |> Enum.join(", "))
    })
  end

  defp command("ops", level, room, socket) when level in [:mod, :admin] do
    room = get_room(channel)

    push(socket, "chat", %ChatMessage{
      content:
        "ops: " <> ((room.mods ++ [room.user]) |> Enum.map(& &1.username) |> Enum.join(", "))
    })
  end

  defp command("controls", :admin, room, socket) do
    controls = !public_controls?(channel)
    Room.set_public_controls(get_room(channel), controls)

    if controls do
      push(socket, "chat", %ChatMessage{content: "Controls are now public"})
    else
      push(socket, "chat", %ChatMessage{content: "Controls are now operators-only"})
    end
  end

  defp command("speed " <> speed, level, room, socket) when level in [:mod, :admin] do
    {speed, _} = Float.parse(speed)

    get_room(channel).title
    |> ProcessRegistry.lookup(:video)
    |> Grasstube.VideoAgent.set_speed(speed)
  end

  defp command("autopause", level, room, socket) when level in [:mod, :admin] do
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

  defp command("untrack " <> name, level, room, socket) when level in [:mod, :admin] do
    room = get_room(channel)

    if GrasstubeWeb.VideoLive.untrack(room.title, name) == :ok do
      push(socket, "chat", %ChatMessage{
        name: room.title,
        content: "untracked " <> name
      })
    else
      push(socket, "chat", %ChatMessage{
        name: room.title,
        content: "unable to untrack " <> name
      })
    end
  end

  defp command("ready", level, room, socket) do
    Agent.update(channel, fn state ->
      current_time = DateTime.utc_now(:microsecond)

      user_id = get_socket(socket).assigns.user_id

      if state.last_ready == nil or
           DateTime.diff(current_time, state.last_ready, :microsecond) / 1_000_000 > 11 do
        if state.room.public_controls or level in [:mod, :admin] do
          users = Grasstube.Presence.list("geo:" <> topic(socket))

          if length(Map.keys(users)) < 2 do
            push(socket, "chat", %ChatMessage{content: "Not enough users to ready"})
            state
          else
            Endpoint.broadcast(topic(socket), "chat", %ChatMessage{
              content: "ready",
              extra_data: %{
                command: "create",
                id: DateTime.to_string(current_time),
                members:
                  users
                  |> Enum.map(fn {id, %{metas: metas}} ->
                    {id, %{geo: Enum.at(metas, 0) |> Map.get(:geo)}}
                  end)
                  |> Map.new()
              }
            })

            state = %{
              state
              | ready_members:
                  users |> Enum.map(fn {id, _} -> {id, id == user_id} end) |> Map.new()
            }

            Endpoint.broadcast(topic(socket), "chat", %ChatMessage{
              content: "ready",
              extra_data: %{
                command: "ready",
                id: DateTime.to_string(current_time),
                user_id: user_id
              }
            })

            %{state | last_ready: current_time}
          end
        else
          push(socket, "chat", %ChatMessage{content: "You can't start a ready"})
          state
        end
      else
        Endpoint.broadcast(topic(socket), "chat", %ChatMessage{
          content: "ready",
          extra_data: %{
            command: "ready",
            id: DateTime.to_string(state.last_ready),
            user_id: user_id
          }
        })

        ready_members = state.ready_members |> Map.put(user_id, true)

        ready_members
        |> Enum.map(&elem(&1, 1))
        |> Enum.all?()
        |> if do
          ProcessRegistry.lookup(state.room.title, :video)
          |> VideoAgent.set_playing(true)

          Endpoint.broadcast(topic(socket), "chat", %ChatMessage{
            content: "ready",
            extra_data: %{command: "close", id: DateTime.to_string(state.last_ready)}
          })

          %{state | last_ready: nil}
        else
          %{state | ready_members: ready_members}
        end
      end
    end)
  end

  defp command(cmd, level, room, socket) do
    push(socket, "chat", %ChatMessage{content: "No command #{cmd}"})
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

  def get_history(pid), do: Agent.get(pid, & &1.history)

  def admin(pid), do: Agent.get(pid, & &1.room.user)


  def socket_username({socket, _pid}), do: socket_username(socket)

  def socket_username(%{assigns: %{user: "$" <> _}}), do: nil

  def socket_username(%{assigns: %{user: nil}}), do: nil

  def socket_username(%{assigns: %{user: %{username: username}}}), do: username

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
    case Agent.get(pid, & &1.room.password) do
      nil -> false
      password -> String.length(password) > 0
    end
  end

  def check_password(pid, password), do: Agent.get(pid, & &1.room.password) == password

end
