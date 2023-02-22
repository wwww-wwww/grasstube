defmodule GrasstubeWeb.UserController do
  use GrasstubeWeb, :controller

  alias Grasstube.{Accounts, Emote, ProcessRegistry, Repo, User}
  alias GrasstubeWeb.UserAuth

  def sign_in(conn, %{"username" => username, "password" => password} = user_params) do
    if user = Accounts.get_user_by_username_and_password(username, password) do
      UserAuth.log_in_user(conn, user, user_params)
    else
      conn
      |> put_flash(:error, "Incorrect username or password")
      |> redirect(to: Routes.user_path(conn, :sign_in))
    end
  end

  def sign_out(conn, _params) do
    conn
    |> put_flash(:info, "Logged out successfully.")
    |> UserAuth.log_out_user()
  end

  def sign_up(conn, %{"username" => username, "password" => password}) do
    case Accounts.register_user(%{username: username, password: password}) do
      {:ok, user} ->
        conn
        |> put_flash(:info, "User created successfully.")
        |> UserAuth.log_in_user(user)

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

  def add_emote(conn, %{"emote" => name, "url" => url}) do
    user = conn.assigns.current_user

    emote =
      Ecto.build_assoc(user, :emotes,
        emote: name |> to_string() |> String.downcase() |> String.trim(":"),
        url: url
      )

    if Application.get_env(:grasstube, :serve_emotes) do
      Emote.download(emote)
    else
      {:ok, emote}
    end
    |> case do
      {:ok, cs} ->
        case Repo.insert(cs) do
          {:ok, _} ->
            Grasstube.Room.reload_emotelist(user)

            conn
            |> put_flash(:info, "added " <> name)
            |> redirect(to: Routes.user_path(conn, :show_user, user.username))

          {:error, err} ->
            conn
            |> put_flash(:error, inspect(err))
            |> redirect(to: Routes.user_path(conn, :show_user, user.username))
        end

      err ->
        conn
        |> put_flash(:error, inspect(err))
        |> redirect(to: Routes.user_path(conn, :show_user, user.username))
    end
  end

  def import_emotes(conn, %{"json" => json}) do
    user = conn.assigns.current_user

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
    user = conn.assigns.current_user

    case Repo.get(Emote, emote_id) do
      nil ->
        redirect(conn, to: Routes.user_path(conn, :show_user, user.username))

      emote ->
        if emote.user_username == user.username do
          case Repo.delete(emote) do
            {:ok, _} ->
              Grasstube.Room.reload_emotelist(user)

              redirect(conn, to: Routes.user_path(conn, :show_user, user.username))

            {:error, _} ->
              redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
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
    case conn.assigns.current_user do
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
    user = conn.assigns.current_user
    room_id = room_name |> to_string() |> String.downcase()

    if Repo.preload(user, [:rooms]).rooms |> Enum.map(&(room_id == &1.title)) |> Enum.any?() do
      ProcessRegistry.delete_room(room_id)
      redirect(conn, to: Routes.user_path(conn, :show_user, user.username))
    else
      conn
      |> put_flash("error", "you can't close this room")
      |> redirect(to: Routes.user_path(conn, :show_user, user.username))
    end
  end

  def emote(conn, %{"id" => id}) do
    case Repo.get(Emote, id) do
      %Emote{data: nil} ->
        conn
        |> put_status(:not_found)
        |> text("Emote does not have data")

      %Emote{data: data, content_type: content_type} ->
        conn
        |> put_resp_content_type(content_type)
        |> send_resp(200, data)

      _ ->
        conn
        |> put_status(:not_found)
        |> text("Emote not found")
    end
  end
end
