defmodule GrasstubeWeb.UserLive.Settings do
  use GrasstubeWeb, :live_view
  import Ecto.Query, only: [from: 2]

  alias Grasstube.{Accounts, Room, Repo, Emote, ChatAgent, ProcessRegistry}

  @impl true
  def render(assigns) do
    ~H"""
    <h2>Password</h2>
    <.form
      for={@password_form}
      id="password_form"
      action={~p"/user/update-password"}
      method="post"
      phx-change="validate_password"
      phx-submit="update_password"
      phx-trigger-action={@trigger_submit}
    >
      <input
        name={@password_form[:username].name}
        type="hidden"
        id="hidden_user_username"
        spellcheck="false"
        value={@current_username}
      />
      <.input
        field={@password_form[:password]}
        type="password"
        label="New password"
        autocomplete="new-password"
        spellcheck="false"
        required
      />
      <.input
        field={@password_form[:password_confirmation]}
        type="password"
        label="Confirm new password"
        autocomplete="new-password"
        spellcheck="false"
      />
      <.button variant="primary" phx-disable-with="Saving...">
        Save Password
      </.button>
    </.form>

    <h2>Rooms</h2>
    <div :for={r <- @rooms}>
      <.link href={~p"/room/#{r.title}"}>{r.title}</.link>
      <.link href={~p"/room/#{r.title}/edit"}>Edit</.link>
    </div>

    <h2>Emotes</h2>
    <form id="emote-form" phx-change="emote_validate" phx-submit="emote_add">
      <input name="name" placeholder="name" autocomplete="off" required />

      <.live_file_input upload={@uploads.emote} phx-drop-target={@uploads.emote.ref} />

      <article :for={entry <- @uploads.emote.entries} class="upload-entry">
        <.live_img_preview entry={entry} />
        <div>
          <progress value={entry.progress} max="100">{entry.progress}% </progress>
          <button
            type="button"
            phx-click="cancel-upload"
            phx-value-ref={entry.ref}
            aria-label="cancel"
          >
            &times;
          </button>
        </div>
      </article>

      <input type="submit" value="Add" />
    </form>

    <table class="emotelist">
      <tr :for={e <- @emotes}>
        <td>{e.name}</td>
        <td><img src={~p"/emotes/#{to_string(e.id) <> ".png"}"} /></td>
        <td>
        <form phx-submit="emote_save_keybind">
          <input type="hidden" name="id" value={e.id} />
          <input type="text" name="key" value={e.keybind || ""} placeholder="Keybind" autocomplete="off" />
          <input type="submit" value="Save"/>
        </form></td>
        <td><button phx-click="emote_delete" phx-value-id={e.id}>Delete</button></td>
      </tr>
    </table>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user
    password_changeset = Accounts.change_user_password(user, %{}, hash_password: false)

    rooms =
      from(r in Room, where: r.user_id == ^user.id)
      |> Repo.all()
      |> Enum.sort_by(& &1.inserted_at)

    emotes =
      from(e in Emote, where: e.user_id == ^user.id)
      |> Repo.all()
      |> Enum.sort_by(& &1.inserted_at, :desc)

    socket =
      socket
      |> assign(current_username: user.username)
      |> assign(password_form: to_form(password_changeset))
      |> assign(trigger_submit: false)
      |> assign(rooms: rooms)
      |> assign(emotes: emotes)
      |> allow_upload(:emote, accept: ~w(.jpg .jpeg .png .webp .gif), max_entries: 1)

    {:ok, socket}
  end

  defp update_emotes(socket) do
    emotes =
      from(e in Emote, where: e.user_id == ^socket.assigns.current_scope.user.id)
      |> Repo.all()
      |> Enum.sort_by(& &1.inserted_at, :desc)

    from(r in Room, where: r.user_id == ^socket.assigns.current_scope.user.id)
    |> Repo.all()
    |> Enum.each(fn room ->
      ProcessRegistry.lookup(room.id, ChatAgent)
      |> ChatAgent.update_emotes(emotes)
    end)

    emotes
  end

  @impl true
  def handle_event("validate_password", params, socket) do
    %{"user" => user_params} = params

    password_form =
      socket.assigns.current_scope.user
      |> Accounts.change_user_password(user_params, hash_password: false)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, password_form: password_form)}
  end

  @impl true
  def handle_event("update_password", params, socket) do
    %{"user" => user_params} = params
    user = socket.assigns.current_scope.user

    case Accounts.change_user_password(user, user_params) do
      %{valid?: true} = changeset ->
        {:noreply, assign(socket, trigger_submit: true, password_form: to_form(changeset))}

      changeset ->
        {:noreply, assign(socket, password_form: to_form(changeset, action: :insert))}
    end
  end

  def handle_event("emote_validate", params, socket) do
    IO.inspect("validate")
    {:noreply, socket}
  end

  def handle_event("emote_add", %{"name" => name}, socket) do
    consume_uploaded_entries(socket, :emote, fn %{path: path}, _entry ->
      Repo.transact(fn ->
        {:ok, emote} =
          %Emote{name: name, user_id: socket.assigns.current_scope.user.id}
          |> Repo.insert()

        dest =
          Path.join(Application.app_dir(:grasstube, "priv/static/emotes"), "#{emote.id}.png")

        case File.cp(path, dest) do
          :ok ->
            {:ok, emote}

          err ->
            {:error, err}
        end
      end)
    end)

    emotes = update_emotes(socket)

    {:noreply, assign(socket, emotes: emotes)}
  end

  def handle_event("emote_delete", %{"id" => id}, socket) do
    case Repo.get(Emote, id) do
      nil ->
        {:noreply, socket}

      emote ->
        if emote.user_id == socket.assigns.current_scope.user.id do
          Repo.delete(emote)

          Path.join(Application.app_dir(:grasstube, "priv/static/emotes"), "#{emote.id}.png")
          |> File.rm()

          emotes = update_emotes(socket)

          {:noreply, assign(socket, emotes: emotes)}
        else
          {:noreply, socket}
        end
    end
  end

  def handle_event("emote_save_keybind", %{"id" => id, "key" => key}, socket) do
    case Repo.get(Emote, id) do
      nil ->
        {:noreply, socket}

      emote ->
        if emote.user_id == socket.assigns.current_scope.user.id do
          emote
          |> Ecto.Changeset.change(%{keybind: key})
          |> Repo.update()

          emotes = update_emotes(socket)
          {:noreply, assign(socket, emotes: emotes)}
        else
          {:noreply, socket}
        end
    end
  end
end
