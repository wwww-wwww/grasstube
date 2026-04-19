defmodule GrasstubeWeb.RoomEditLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Room, Repo, User, ProcessRegistry, VideoAgent, RoomMod, RoomAgent}

  def render(assigns) do
    ~H"""
    <h1>{@room.title}</h1>
    <form phx-submit="save">
      <div>
        <label for="password">Password</label>
        <input name="password" id="password" type="text" value={@room.password} />
      </div>
      <div>
        <label for="public_controls">Public controls</label>
        <input
          name="public_controls"
          id="public_controls"
          type="checkbox"
          checked={@room.public_controls}
        />
      </div>
      <div>
        <label for="autopause">Autopause</label>
        <input name="autopause" id="autopause" type="checkbox" checked={@room.autopause} />
      </div>
      <div>
        <label for="media_directories">Media directories</label>
        <textarea name="media_directories" id="media_directories" style="width: 100%">{(@room.media_directories || []) |> Enum.join("\n")}</textarea>
      </div>
      <input type="submit" value="Save" />
    </form>
    <h2>Operators</h2>
    <div :for={u <- @room.mods}>
      <div>
        <span>{u.username}</span><button class="close" phx-click="mod_remove" phx-value-id={u.id}></button>
      </div>
    </div>
    <br />
    <form phx-submit="mod_add">
      <div>
        <label for="mod-add-username">Username</label>
        <input name="username" id="mod-add-username" autocomplete="off" />
      </div>
      <input type="submit" value="Add" />
    </form>
    """
  end

  def mount(%{"title" => title}, _session, socket) do
    room = Repo.get_by(Room, title: title) |> Repo.preload(:mods)

    if socket.assigns.current_scope.user.id != room.user_id do
      {:ok, socket |> put_flash(:error, "You can't edit this room!") |> push_navigate(to: ~p"/")}
    else
      socket =
        socket
        |> assign(room: room)

      {:ok, socket}
    end
  end

  def handle_event(
        "save",
        %{"password" => password, "media_directories" => media_directories} = params,
        socket
      ) do
    public_controls = params |> Map.get("public_controls") |> Kernel.==("on")
    autopause = params |> Map.get("autopause") |> Kernel.==("on")

    media_directories =
      media_directories
      |> String.trim()
      |> String.split("\n")
      |> Enum.filter(&(String.length(&1) > 0))

    {:ok, room} =
      Repo.transact(fn ->
        Repo.reload(socket.assigns.room)
        |> Ecto.Changeset.change(%{
          password: password,
          media_directories: media_directories,
          public_controls: public_controls,
          autopause: autopause
        })
        |> Repo.update()
      end)

    room = room |> Repo.preload(:mods, force: true)

    ProcessRegistry.lookup(socket.assigns.room.id, VideoAgent)
    |> VideoAgent.set_autopause(autopause)

    socket = socket |> assign(room: room)

    ProcessRegistry.lookup(socket.assigns.room.id, RoomAgent)
    |> RoomAgent.reload()

    {:noreply, socket}
  end

  def handle_event("mod_add", %{"username" => username}, socket) do
    with %User{} = user <- Repo.get_by(User, username: username) do
      %RoomMod{user_id: user.id, room_id: socket.assigns.room.id}
      |> Repo.insert()

      room = socket.assigns.room |> Repo.preload(:mods, force: true)

      ProcessRegistry.lookup(socket.assigns.room.id, RoomAgent)
      |> RoomAgent.reload()

      {:noreply, assign(socket, room: room)}
    else
      _ -> {:noreply, socket}
    end
  end

  def handle_event("mod_remove", %{"id" => id}, socket) do
    Repo.get_by(RoomMod, user_id: id, room_id: socket.assigns.room.id) |> Repo.delete()
    room = socket.assigns.room |> Repo.preload(:mods, force: true)
    socket = assign(socket, room: room)

    ProcessRegistry.lookup(socket.assigns.room.id, RoomAgent)
    |> RoomAgent.reload()

    {:noreply, socket}
  end
end
