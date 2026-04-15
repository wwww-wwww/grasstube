defmodule Grasstube.Repo.Migrations.CreateVideos do
  use Ecto.Migration

  def change do
    create table(:video) do
      add :title, :string
      add :type, :string
      add :video_url, :string, size: 2048
      add :subtitles_url, :string, size: 2048
      add :alts, :map
      add :duration, :float
      add :ready, :boolean
      add :order, :integer

      add :room_id, references(:room, on_delete: :delete_all)

      timestamps()
    end
  end
end
