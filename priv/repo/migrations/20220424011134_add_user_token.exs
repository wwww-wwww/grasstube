defmodule Grasstube.Repo.Migrations.AddUserToken do
  use Ecto.Migration

  def change do
    create table(:users_tokens) do
      add :user_id, references(:users, type: :string, column: :username, on_delete: :delete_all),
        null: false

      add :token, :binary, null: false
      add :context, :string, null: false
      timestamps(updated_at: false)
    end

    create index(:users_tokens, [:user_id])
    create unique_index(:users_tokens, [:context, :token])
  end
end
