defmodule Grasstube.Repo.Migrations.CreateRooms do
  use Ecto.Migration

  def change do
    create table(:room) do
      add :title, :string
      add :password, :string
      add :public_controls, :boolean

      add :user_id, references(:user, on_delete: :delete_all)

      timestamps()
    end

    create unique_index(:room, [:title])
  end
end
