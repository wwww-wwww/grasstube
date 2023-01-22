defmodule Grasstube.Repo.Migrations.AddVideos do
  use Ecto.Migration

  def change do
    create table(:videos) do
      add :title, :string
      add :type, :string
      add :url, :string
      add :sub, :string
      add :alts, :map
      add :duration, :float
      add :ready, :boolean

      add :room_id, references(:rooms, on_delete: :delete_all)

      timestamps()
    end
  end
end
