defmodule Grasstube.Repo.Migrations.AddRoomsUsers do
  use Ecto.Migration

  def change do
    create table(:rooms_mods, primary_key: false) do
      add :room_id, references(:rooms, on_delete: :delete_all)

      add :user_username,
          references(:users, column: :username, type: :string, on_delete: :delete_all)

      timestamps()
    end

    create unique_index(:rooms_mods, [:room_id, :user_username])

    create table(:rooms_emotelists, primary_key: false) do
      add :room_id, references(:rooms, on_delete: :delete_all)

      add :user_username,
          references(:users, column: :username, type: :string, on_delete: :delete_all)

      timestamps()
    end

    create unique_index(:rooms_emotelists, [:room_id, :user_username])
  end
end
