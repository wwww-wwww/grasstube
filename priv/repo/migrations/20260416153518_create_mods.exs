defmodule Grasstube.Repo.Migrations.CreateMods do
  use Ecto.Migration

  def change do
    create table(:room_mod) do
      add :room_id, references(:room, on_delete: :delete_all)
      add :user_id, references(:user, on_delete: :delete_all)
    end

    create unique_index(:room_mod, [:room_id, :user_id])
  end
end
