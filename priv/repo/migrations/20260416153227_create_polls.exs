defmodule Grasstube.Repo.Migrations.CreatePolls do
  use Ecto.Migration

  def change do
    create table(:poll) do
      add :name, :string
      add :options, {:array, :string}
      add :room_id, references(:room, on_delete: :delete_all)

      timestamps()
    end

    create table(:user_poll) do
      add :user_id, references(:user, on_delete: :delete_all)
      add :poll_id, references(:poll, on_delete: :delete_all)
      add :option, :integer
    end

    create unique_index(:user_poll, [:user_id, :poll_id])
  end
end
