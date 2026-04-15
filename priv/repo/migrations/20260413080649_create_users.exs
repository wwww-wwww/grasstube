defmodule Grasstube.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:user) do
      add :username, :string
      add :display_name, :string
      add :password_hash, :string

      timestamps()
    end

    create unique_index(:user, [:username])

    create table(:user_tokens) do
      add :user_id, references(:user, on_delete: :delete_all), null: false
      add :token, :binary, null: false
      add :authenticated_at, :utc_datetime

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:user_tokens, [:user_id])
    create unique_index(:user_tokens, [:token])
  end
end
