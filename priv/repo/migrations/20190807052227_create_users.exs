defmodule Grasstube.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users, primary_key: false) do
      add :username, :string, size: 24, primary_key: true
      add :name, :string, size: 24
      add :nickname, :string, size: 24
      add :password, :string

      timestamps()
    end
  end
end
