defmodule Grasstube.Repo.Migrations.AddRoomMediaDirectories do
  use Ecto.Migration

  def change do
    alter table(:room) do
      add :media_directories, {:array, :string}
    end
  end
end
