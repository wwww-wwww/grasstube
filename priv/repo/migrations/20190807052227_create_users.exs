defmodule Grasstube.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users, primary_key: false) do
      add :username, :string, primary_key: true
      add :name, :string
      add :nickname, :string
      add :password, :string

      timestamps()
    end
  end
end
