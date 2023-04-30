defmodule Grasstube.Repo.Migrations.RoomAttributes do
  use Ecto.Migration

  def change do
    alter table(:rooms) do
      remove :scripts
      add :attributes, :map
    end
  end
end
