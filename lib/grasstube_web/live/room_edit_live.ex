defmodule GrasstubeWeb.RoomEditLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Room, Repo}

  def render(assigns) do
    ~H"""
    <div>
      <h2>Media directories</h2>
      <form phx-submit="media_directories_save">
        <textarea name="media_directories" style="width: 100%">{(@room.media_directories || []) |> Enum.join("\n")}</textarea>
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

  def handle_event("media_directories_save", %{"media_directories" => media_directories}, socket) do
    media_directories =
      media_directories
      |> String.trim()
      |> String.split("\n")
      |> Enum.filter(&(String.length(&1) > 0))

    {:ok, room} =
      Repo.transact(fn ->
        Repo.reload(socket.assigns.room)
        |> Ecto.Changeset.change(media_directories: media_directories)
        |> Repo.update()
      end)

    socket = socket |> assign(room: room)

    {:noreply, socket}
  end
end
