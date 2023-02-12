defmodule Grasstube.Repo.Migrations.AddEmotesData do
  use Ecto.Migration

  def change do
    alter table(:emotes) do
      add :data, :binary
      add :content_type, :string
    end
  end
end
