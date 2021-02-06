defmodule GrasstubeWeb.ChatAgent do
  use Agent

  alias GrasstubeWeb.Endpoint

  alias Grasstube.Repo

  alias Phoenix.HTML

  require Logger
  require AutoLinker

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

  def via_tuple(room_name) do
    Grasstube.ProcessRegistry.via_tuple({room_name, :chat})
  end

  def chat(channel, socket, msg) do
    if is_command?(String.trim(msg)) do
      "/" <> command = String.trim(msg)
      command(channel, socket, command)
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

  defp command(channel, socket, "op " <> username) do
    if Guardian.Phoenix.Socket.authenticated?(socket) and
         get_admin(channel) == Guardian.Phoenix.Socket.current_resource(socket).username do
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
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(channel, socket, "deop " <> username) do
    if Guardian.Phoenix.Socket.authenticated?(socket) and
         get_admin(channel) == Guardian.Phoenix.Socket.current_resource(socket).username do
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
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(channel, socket, "add_emotelist " <> username) do
    username_lower = username |> String.downcase()

    if Guardian.Phoenix.Socket.authenticated?(socket) and
         mod?(channel, Guardian.Phoenix.Socket.current_resource(socket)) do
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
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(channel, socket, "remove_emotelist " <> username) do
    username_lower = username |> String.downcase()

    if Guardian.Phoenix.Socket.authenticated?(socket) and
         mod?(channel, Guardian.Phoenix.Socket.current_resource(socket)) do
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
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(channel, socket, "clear") do
    if Guardian.Phoenix.Socket.authenticated?(socket) and
         mod?(channel, Guardian.Phoenix.Socket.current_resource(socket)) do
      Agent.update(channel, fn val ->
        %{val | history: []}
      end)

      Endpoint.broadcast(socket.topic, "clear", %{})
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(channel, socket, "emotelists") do
    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: "System",
      content: "emotelists: " <> (get_emotelists(channel) |> Enum.join(", "))
    })
  end

  defp command(channel, socket, "ops") do
    if Guardian.Phoenix.Socket.authenticated?(socket) and
         mod?(channel, Guardian.Phoenix.Socket.current_resource(socket)) do
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "ops: " <> ((get_mods(channel) ++ [get_admin(channel)]) |> Enum.join(", "))
      })
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(channel, socket, "controls") do
    if Guardian.Phoenix.Socket.authenticated?(socket) and
         get_admin(channel) == Guardian.Phoenix.Socket.current_resource(socket).username do
      Agent.update(channel, fn val ->
        %{val | public_controls: !val.public_controls}
      end)

      controls = public_controls?(channel)

      if controls do
        Phoenix.Channel.push(socket, "chat", %{
          sender: "sys",
          name: "System",
          content: "controls are now public"
        })
      else
        Phoenix.Channel.push(socket, "chat", %{
          sender: "sys",
          name: "System",
          content: "controls are now operators-only"
        })
      end
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
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
        content: "no motd is set"
      })
    end
  end

  defp command(channel, socket, "clear_motd") do
    if Guardian.Phoenix.Socket.authenticated?(socket) and
         mod?(channel, Guardian.Phoenix.Socket.current_resource(socket)) do
      Agent.update(channel, fn val ->
        %{val | motd: ""}
      end)

      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: get_room_name(channel),
        content: "motd cleared"
      })
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(channel, socket, "motd " <> motd) do
    if Guardian.Phoenix.Socket.authenticated?(socket) and
         mod?(channel, Guardian.Phoenix.Socket.current_resource(socket)) do
      Agent.update(channel, fn val ->
        %{val | motd: motd}
      end)

      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: get_room_name(channel),
        content: "motd set to \"" <> motd <> "\""
      })
    else
      Phoenix.Channel.push(socket, "chat", %{
        sender: "sys",
        name: "System",
        content: "you can't do this!"
      })
    end
  end

  defp command(_channel, socket, cmd) do
    Phoenix.Channel.push(socket, "chat", %{
      sender: "sys",
      name: "System",
      content: "no command " <> cmd
    })
  end

  def get_room_name(pid) do
    Agent.get(pid, fn val ->
      val.room_name
    end)
  end

  def get_motd(pid) do
    Agent.get(pid, fn val ->
      val.motd
    end)
  end

  def public_controls?(pid) do
    Agent.get(pid, fn val ->
      val.public_controls
    end)
  end

  def controls?(pid, socket) do
    cond do
      public_controls?(pid) ->
        true

      Guardian.Phoenix.Socket.authenticated?(socket) ->
        user = Guardian.Phoenix.Socket.current_resource(socket)
        mod?(pid, user)

      true ->
        false
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
    get_mods(pid) |> Enum.any?(fn mod -> mod == user.username end) ||
      get_admin(pid) == user.username
  end

  def set_name(socket, name) do
    if Guardian.Phoenix.Socket.authenticated?(socket) do
      changeset =
        Repo.get(Grasstube.User, socket.assigns.user_id)
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
    get_emotelists(pid)
    |> Enum.reduce([], fn username, acc ->
      user = Repo.get(Grasstube.User, username) |> Repo.preload(:emotes)

      emotes =
        user.emotes
        |> Enum.reduce([], fn emote, acc -> [%{emote: emote.emote, url: emote.url} | acc] end)

      emotes ++ acc
    end)
  end

  defp do_emote(pid, msg) do
    emotes = get_emotes(pid)
    parse_emote(msg, "", emotes)
  end

  defp split_emote(msg) do
    Regex.split(~r{(:[^:]+:)}, msg, include_captures: true, parts: 2)
  end

  defp process_emote(input, emotes) do
    case emotes
         |> Enum.find(:not_emote, fn emote ->
           String.downcase(input) == ":" <> emote.emote <> ":"
         end) do
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
    password = Agent.get(pid, fn val -> val.password end)
    String.length(password) > 0
  end

  def check_password(pid, password) do
    Agent.get(pid, fn val -> val.password end) == password
  end

  def auth(socket, room_name, password) do
    case Grasstube.ProcessRegistry.lookup(room_name, :chat) do
      :not_found ->
        {:error, "no room"}

      chat ->
        if not password?(chat) or check_password(chat, password) do
          {:ok, socket}
        else
          if Guardian.Phoenix.Socket.authenticated?(socket) and
               mod?(chat, Guardian.Phoenix.Socket.current_resource(socket)) do
            {:ok, socket}
          else
            {:error, "bad password"}
          end
        end
    end
  end
end
