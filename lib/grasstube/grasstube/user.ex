defmodule Grasstube.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "users" do
    field :username, :string, size: 24, primary_key: true
    field :name, :string, size: 24
    field :nickname, :string, size: 24
    field :password, :string

    has_many :emotes, Grasstube.Emote, references: :username

    timestamps()
  end

  @doc false
  def changeset(user, attrs \\ %{}) do
    user
    |> cast(attrs, [:username, :password])
    |> validate_required([:username, :password])
    |> validate_changeset
    |> copy_username
    |> generate_password_hash
  end

  defp validate_changeset(struct) do
    struct
    |> validate_length(:username, min: 1, max: 32)
    |> validate_format(:username, ~r/^[A-z0-9_-]+$/,
      message: "Must consist only of letters, numbers, and - or _"
    )
    |> unique_constraint(:username, name: :users_pkey, message: "already exists")
    |> validate_length(:password, min: 6)
  end

  defp copy_username(changeset) do
    case changeset do
      %Ecto.Changeset{valid?: true, changes: %{username: username}} ->
        changeset
        |> put_change(:nickname, username)
        |> put_change(:name, username)
        |> put_change(:username, username |> String.downcase())

      _ ->
        changeset
    end
  end

  defp generate_password_hash(changeset) do
    case changeset do
      %Ecto.Changeset{valid?: true, changes: %{password: password}} ->
        put_change(changeset, :password, Bcrypt.hash_pwd_salt(password))

      _ ->
        changeset
    end
  end
end
