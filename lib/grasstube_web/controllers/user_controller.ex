defmodule GrasstubeWeb.UserController do
  use GrasstubeWeb, :controller

  import Ecto.Query, only: [from: 2]

  alias Grasstube.Guardian
  alias Grasstube.Repo
  alias Grasstube.User
  alias Grasstube.Emote

  def sign_up_page(conn, _params) do
    changeset = User.changeset(%User{})
    render(conn, "sign_up.html", changeset: changeset, name: "sign_up")
  end

  def sign_in_page(conn, _params) do
    render(conn, "sign_in.html", name: "sign_in")
  end

  def sign_in(conn, %{"username" => username, "password" => password}) do
    case Repo.get_by(User, username: username) do
      nil ->
        conn
        |> put_flash(:error, "Incorrect username or password")
        |> redirect(to: "/sign_in")
      user ->
        if Bcrypt.verify_pass(password, user.password) do
          conn
          |> Guardian.Plug.sign_in(user)
          |> redirect(to: "/")
        else
          conn
          |> put_flash(:error, "Incorrect username or password")
          |> redirect(to: "/sign_in")
        end
    end
  end

  def sign_out(conn, _params) do
    conn
    |> Guardian.Plug.sign_out()
    |> redirect(to: "/")
  end

  def sign_up(conn, %{"user" => user}) do
    changeset = User.changeset(%User{}, user)

    case Repo.insert(changeset) do
      {:ok, user} ->
        conn
        |> Guardian.Plug.sign_in(user)
        |> redirect(to: "/")
      {:error, changeset} ->
        errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
          Enum.reduce(opts, msg, fn {key, value}, acc ->
            String.replace(acc, "%{#{key}}", to_string(value))
          end)
        end) |> Enum.map(fn {k, v} -> "#{k} #{v}" end)
        conn
        |> put_flash(:error, errors |> Enum.at(0))
        |> redirect(to: "/sign_up")
    end
  end

  def show_user(conn, %{"username" => username}) do
    user = Guardian.Plug.current_resource(conn)
    if user != nil and user.username == username do
      render(conn, "profile_self.html", username: username, name: "profile")
    else
      render(conn, "profile.html", username: username, name: "profile")
    end
  end

  def add_emote(conn, %{"emote" => emote, "url" => url}) do
    user = Guardian.Plug.current_resource(conn)
    new_emote = Ecto.build_assoc(user, :emotes, emote: String.downcase(emote), url: url)
    case Repo.insert(new_emote) do
      {:ok, emote} ->
        conn
        |> redirect(to: "/user/#{user.username}")
      {:error, _} ->
        conn
        |> redirect(to: "/user/#{user.username}")
    end
  end

  def delete_emote(conn, %{"id" => emote_id}) do
    user = Guardian.Plug.current_resource(conn)

    case Repo.get(Emote, emote_id) do
      nil -> redirect(conn, to: "/user/#{user.username}")
      emote ->
        if emote.user_username == user.username do
          case Repo.delete(emote) do
            {:ok, struct} -> redirect(conn, to: "/user/#{user.username}")
            {:error, changeset} -> redirect(conn, to: "/user/#{user.username}")
          end
        else
          redirect(conn, to: "/user/#{user.username}")
        end
    end
  end

end
