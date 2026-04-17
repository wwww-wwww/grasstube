defmodule Grasstube.Repo.Migrations.AddAutopause do
  use Ecto.Migration

  def change do
    alter table(:room) do
      add :autopause, :boolean
    end
  end
end
