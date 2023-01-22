defmodule GrasstubeWeb.SignInLive do
  use GrasstubeWeb, :live_view

  def render(assigns) do
    GrasstubeWeb.UserView.render("sign_in.html", assigns)
  end

  def mount(_, _, socket) do
    {:ok, assign(socket, page_title: "Sign In")}
  end
end

defmodule GrasstubeWeb.SignUpLive do
  use GrasstubeWeb, :live_view

  def render(assigns) do
    GrasstubeWeb.UserView.render("sign_up.html", assigns)
  end

  def mount(_, _, socket) do
    {:ok, assign(socket, page_title: "Sign Up")}
  end
end

defmodule GrasstubeWeb.UserLive do
  use GrasstubeWeb, :live_view

  alias Grasstube.{Emote, User, Repo}

  def render(assigns) do
    GrasstubeWeb.UserView.render("profile.html", assigns)
  end

  def mount(%{"username" => username}, _session, socket) do
    socket =
      Repo.get(User, username)
      |> Repo.preload([:emotes, :rooms])
      |> case do
        nil ->
          socket
          |> put_flash(:error, "User does not exist")
          |> push_redirect(to: Routes.live_path(socket, GrasstubeWeb.RoomsLive))

        user ->
          socket
          |> assign(page_title: user.username)
          |> assign(user: user)
          |> assign(
            is_current_user:
              User.is(socket.assigns.current_user) and
                socket.assigns.current_user.username == user.username
          )
      end

    {:ok, socket}
  end

  def handle_event("emote_add", %{"name" => name, "url" => url}, socket) do
    user = socket.assigns.current_user

    socket =
      Ecto.build_assoc(user, :emotes,
        emote: name |> String.downcase() |> String.trim(":"),
        url: url
      )
      |> Repo.insert()
      |> case do
        {:ok, _} ->
          assign(socket, emotes: Repo.preload(user, :emotes).emotes |> Enum.sort_by(& &1.emote))

        {:error, err} ->
          put_flash(socket, :error, inspect(err))
      end

    {:noreply, socket}
  end

  def handle_event("emote_delete", %{"id" => id}, socket) do
    socket =
      case Repo.get(Emote, id) do
        nil ->
          put_flash(socket, :error, "Emote does not exist")

        emote ->
          if emote.user_username == socket.assigns.current_user.username do
            case Repo.delete(emote) do
              {:ok, _} ->
                assign(socket,
                  emotes:
                    Repo.preload(socket.assigns.current_user, :emotes).emotes
                    |> Enum.sort_by(& &1.emote)
                )

              {:error, err} ->
                put_flash(socket, :error, inspect(err))
            end
          else
            put_flash(socket, :error, "This emote does not belong to you")
          end
      end

    {:noreply, socket}
  end
end

defmodule GrasstubeWeb.CreateRoomLive do
  use GrasstubeWeb, :live_view

  def render(assigns) do
    GrasstubeWeb.UserView.render("create_room.html", assigns)
  end

  def mount(_, _session, socket) do
    {:ok, assign(socket, page_title: "Create a room")}
  end

  def handle_event("create", %{"name" => name, "password" => password}, socket) do
    socket =
      Grasstube.ProcessRegistry.create_room(socket.assigns.current_user, name, password)
      |> case do
        {:ok, room} ->
          push_redirect(socket, to: Routes.live_path(socket, GrasstubeWeb.RoomLive, room))

        {:error, reason} ->
          put_flash(socket, :error, reason)
      end

    {:noreply, socket}
  end
end
