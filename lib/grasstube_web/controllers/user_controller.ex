defmodule GrasstubeWeb.UserController do
  use GrasstubeWeb, :controller

  alias Grasstube.{Emote, Guardian, ProcessRegistry, Repo, User}

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
          |> redirect(to: Routes.live_path(conn, GrasstubeWeb.RoomsLive))
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
          token =
            conn
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
    |> redirect(to: Routes.live_path(conn, GrasstubeWeb.RoomsLive))
  end

  def sign_up(conn, %{"username" => username, "password" => password}) do
    User.changeset(%User{}, %{username: username, password: password})
    |> Repo.insert()
    |> case do
      {:ok, user} ->
        conn
        |> Guardian.Plug.sign_in(user)
        |> redirect(to: Routes.live_path(conn, GrasstubeWeb.RoomsLive))

      {:error, changeset} ->
        errors =
          Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
            Enum.reduce(opts, msg, fn {key, value}, acc ->
              String.replace(acc, "%{#{key}}", to_string(value))
            end)
          end)
          |> Enum.map(fn {k, v} -> "#{k} #{v}" end)

        conn
        |> put_flash(:error, errors |> Enum.at(0))
        |> redirect(to: Routes.user_path(conn, :sign_up))
    end
  end

  def add_emote(conn, %{"emote" => emote, "url" => url}) do
    user = Guardian.Plug.current_resource(conn)

    new_emote =
      Ecto.build_assoc(user, :emotes,
        emote: emote |> to_string() |> String.downcase() |> String.trim(":"),
        url: url
      )

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
          new_emote =
            Ecto.build_assoc(user, :emotes,
              emote: emote |> String.downcase() |> String.trim(":"),
              url: url
            )

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
      nil ->
        redirect(conn, to: Routes.user_path(conn, :show_user, user.username))

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
    case Repo.get(User, username |> to_string() |> String.downcase()) do
      nil ->
        json(conn, %{success: false, message: "user not found"})

      user ->
        emotes =
          Repo.preload(user, :emotes).emotes
          |> Enum.reduce(%{}, fn emote, acc -> Map.put(acc, emote.emote, emote.url) end)

        json(conn, emotes)
    end
  end

  def create_room(conn, %{"room_name" => room_name, "room_password" => room_password}) do
    case Guardian.Plug.current_resource(conn) do
      nil ->
        put_flash(conn, :error, "You must be logged in to do this.")

      user ->
        ProcessRegistry.create_room(user, room_name, room_password)
        |> case do
          {:ok, room} ->
            redirect(conn, to: Routes.live_path(conn, GrasstubeWeb.RoomLive, room))

          {:error, reason} ->
            put_flash(conn, :error, reason)
        end
    end
  end

  def close_room(conn, %{"room_name" => room_name}) do
    user = Guardian.Plug.current_resource(conn)
    room_id = room_name |> to_string() |> String.downcase()

    if room_id in ProcessRegistry.rooms_of(user) do
      ProcessRegistry.close_room(room_id)
      redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
    else
      conn
      |> put_flash("error", "you can't close this room")
      |> redirect(to: Routes.user_path(conn, :show_user, user.username))
    end
  end
end
