defmodule Grasstube.Repo.Migrations.CreateEmotes do
  use Ecto.Migration

  def change do
    create table(:emote) do
      add :name, :string
      add :user_id, references(:user, on_delete: :delete_all)

      timestamps()
    end
  end
end
