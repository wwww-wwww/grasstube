defmodule Grasstube.Repo.Migrations.ChangeVideoUrlLength do
  use Ecto.Migration

  def change do
    alter table(:videos) do
      modify :url, :string, size: 2048
    end
  end
end
