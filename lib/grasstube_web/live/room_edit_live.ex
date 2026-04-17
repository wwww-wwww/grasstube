defmodule GrasstubeWeb.RoomEditLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Room, Repo}

  def render(assigns) do
    ~H"""
    <div>
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
    </div>
    """
  end

  def mount(%{"title" => title}, _session, socket) do
    room = Repo.get_by(Room, title: title)

    if socket.assigns.current_scope.user.id != room.user_id do
      {:ok, socket |> put_flash(:error, "You can't edit this room!") |> push_redirect(to: ~p"/")}
    else
      {:ok, socket |> assign(room: room)}
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

    socket = socket |> assign(room: room)

    {:noreply, socket}
  end
end
