defmodule GrasstubeWeb.RoomCreateLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Room, Repo}

  def render(assigns) do
    ~H"""
    <.form for={@form} id="registration_form" phx-submit="create">
      <.input
        field={@form[:title]}
        type="text"
        label="Title"
        spellcheck="false"
        required
        phx-mounted={JS.focus()}
      />
      <.input field={@form[:password]} type="text" label="Password" spellcheck="false" />

      <.button phx-disable-with="Creating room...">Create</.button>
    </.form>
    """
  end

  def mount(_, _session, socket) do
    form = Room.changeset(%Room{}, %{}) |> to_form
    socket = assign(socket, form: form)
    {:ok, socket}
  end

  def handle_event("create", %{"room" => params}, socket) do
    Room.changeset(%Room{user_id: socket.assigns.current_scope.user.id}, params)
    |> Repo.insert()
    |> case do
      {:ok, room} ->
        Grasstube.ProcessRegistry.start_room(room)
        {:noreply, socket |> push_navigate(to: ~p"/room/#{room.title}")}

      {:error, changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end
end
