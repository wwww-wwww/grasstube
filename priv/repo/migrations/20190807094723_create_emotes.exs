defmodule Grasstube.Repo.Migrations.CreateEmotes do
  use Ecto.Migration

  def change do
    create table(:emotes) do
      add :emote, :string
      add :url, :string

      add :user_username,
          references(:users, column: :username, type: :string, on_delete: :delete_all)

      timestamps()
    end
  end
end
