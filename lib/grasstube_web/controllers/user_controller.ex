defmodule GrasstubeWeb.UserController do
  use GrasstubeWeb, :controller

  alias Grasstube.Guardian
  alias Grasstube.Repo
  alias Grasstube.User
  alias Grasstube.Emote

  def sign_up_page(conn, _params) do
    changeset = User.changeset(%User{})
    render(conn, "sign_up.html", changeset: changeset)
  end

  def sign_in_page(conn, _params) do
    render(conn, "sign_in.html")
  end

  def create_room_page(conn, _params) do
    render(conn, "create_room.html")
  end

  def sign_in(conn, %{"username" => username, "password" => password}) do
    case Repo.get_by(User, username: username |> to_string() |> String.downcase()) do
      nil ->
        conn
        |> put_flash(:error, "Incorrect username or password")
        |> redirect(to: Routes.user_path(conn, :sign_in))
      user ->
        if Bcrypt.verify_pass(password |> to_string(), user.password) do
          conn
          |> Guardian.Plug.sign_in(user)
          |> redirect(to: Routes.page_path(conn, :index))
        else
          conn
          |> put_flash(:error, "Incorrect username or password")
          |> redirect(to: Routes.user_path(conn, :sign_in))
        end
    end
  end

  def auth(conn, %{"username" => username, "password" => password}) do
    case Repo.get_by(User, username: username |> to_string() |> String.downcase()) do
      nil ->
        conn
        |> put_status(200)
        |> json(%{success: false})
      user ->
        if Bcrypt.verify_pass(password |> to_string(), user.password) do
          token = conn
            |> Guardian.Plug.sign_in(user)
            |> Guardian.Plug.current_token()

          conn
          |> put_status(200)
          |> json(%{success: true, token: token})
        else
          conn
          |> put_status(200)
          |> json(%{success: false})
        end
    end
  end

  def sign_out(conn, _params) do
    conn
    |> Guardian.Plug.sign_out()
    |> redirect(to: Routes.page_path(conn, :index))
  end

  def sign_up(conn, %{"user" => user}) do
    changeset = User.changeset(%User{}, user)

    case Repo.insert(changeset) do
      {:ok, user} ->
        conn
        |> Guardian.Plug.sign_in(user)
        |> redirect(to: Routes.page_path(conn, :index))
      {:error, changeset} ->
        errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
          Enum.reduce(opts, msg, fn {key, value}, acc ->
            String.replace(acc, "%{#{key}}", to_string(value))
          end)
        end) |> Enum.map(fn {k, v} -> "#{k} #{v}" end)
        conn
        |> put_flash(:error, errors |> Enum.at(0))
        |> redirect(to: Routes.user_path(conn, :sign_up))
    end
  end

  def show_user(conn, %{"username" => username}) do
    user = Repo.get(Grasstube.User, username |> to_string() |> String.downcase())
    if user != nil do
        render(conn, "profile.html", name: user.name, username: user.username)
    else
      conn
      |> put_flash(:info, "user does not exist")
      |> render(GrasstubeWeb.ErrorView, "404.html")
    end
  end

  def add_emote(conn, %{"emote" => emote, "url" => url}) do
    user = Guardian.Plug.current_resource(conn)
    new_emote = Ecto.build_assoc(user, :emotes, emote: emote |> to_string() |> String.downcase() |> String.trim(":"), url: url)
    case Repo.insert(new_emote) do
      {:ok, _} ->
        redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
      {:error, _} ->
        conn
        |> redirect(to: Routes.user_path(conn, :show_user, user.username))
    end
  end

  def import_emotes(conn, %{"json" => json}) do
    user = Guardian.Plug.current_resource(conn)
    case Jason.decode(json) do
      {:ok, emotes} ->
        Enum.each(emotes, fn {emote, url} ->
          new_emote = Ecto.build_assoc(user, :emotes, emote: emote |> String.downcase() |> String.trim(":"), url: url)
          Repo.insert(new_emote)
        end)
        conn
        |> redirect(to: Routes.user_path(conn, :show_user, user.username))
      {:error, _} ->
        conn
        |> put_flash("error", "bad json")
        |> redirect(to: Routes.user_path(conn, :show_user, user.username))
    end
  end

  def delete_emote(conn, %{"id" => emote_id}) do
    user = Guardian.Plug.current_resource(conn)

    case Repo.get(Emote, emote_id) do
      nil -> redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
      emote ->
        if emote.user_username == user.username do
          case Repo.delete(emote) do
            {:ok, _} -> redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
            {:error, _} -> redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
          end
        else
          redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
        end
    end
  end

  def emotes_json(conn, %{"username" => username}) do
    case Repo.get(Grasstube.User, username |> to_string() |> String.downcase()) do
      nil ->
        json(conn, %{success: false, message: "user not found"})
      user ->
        emotes = Repo.preload(user, :emotes).emotes
        |> Enum.reduce(%{}, fn emote, acc -> Map.put(acc, emote.emote, emote.url) end)
        json(conn, emotes)
    end
  end

  def create_room(conn, %{"room_name" => room_name, "room_password" => room_password}) do
    user = Guardian.Plug.current_resource(conn)
    rooms = Grasstube.ProcessRegistry.rooms_of(user.username)

    cond do
      length(rooms) > 0 ->
        conn
        |> put_flash("error", "you already have a room")
        |> redirect(to: Routes.user_path(conn, :create_room_page))
        
      String.length(room_name) == 0 ->
        conn
        |> put_flash("error", "room name is too short")
        |> redirect(to: Routes.user_path(conn, :create_room_page))

      true ->
        case Grasstube.ProcessRegistry.create_room(room_name, user.username, room_password) do
          {:ok, _} ->
            GrasstubeWeb.RoomsLive.update()
            redirect(conn, to: Routes.page_path(conn, :room, room_name))
          {:error, {reason, _}} ->
            case reason do
              :already_started ->
                conn
                |> put_flash("error", "room already exists with this name")
                |> redirect(to: Routes.user_path(conn, :create_room_page))
              _ ->
                conn
                |> put_flash("error", "error creating room")
                |> redirect(to: Routes.user_path(conn, :create_room_page))
            end
        end

    end
  end

  def close_room(conn, %{"room_name" => room_name}) do
    user = Guardian.Plug.current_resource(conn)
    rooms = Grasstube.ProcessRegistry.rooms_of(user.username)
    room_id = room_name |> to_string() |> String.downcase()
    if room_id in rooms do
      Grasstube.ProcessRegistry.close_room(room_id)
      redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
    else
      conn
      |> put_flash("error", "you can't close this room")
      |> redirect(to: Routes.user_path(conn, :show_user, user.username))
    end
  end
end
