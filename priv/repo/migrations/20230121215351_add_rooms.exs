defmodule Grasstube.Repo.Migrations.AddRooms do
  use Ecto.Migration

  def change do
    create table(:rooms) do
      add :title, :string
      add :password, :string
      add :motd, :string
      add :public_controls, :boolean
      add :scripts, :map
      add :queue, {:array, :id}

      add :user_username,
          references(:users, column: :username, type: :string, on_delete: :delete_all)

      timestamps()
    end

    create unique_index(:rooms, [:title])
  end
end
