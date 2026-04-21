defmodule Grasstube.Repo.Migrations.AddMessage do
  use Ecto.Migration

  def change do
    create table(:message) do
      add :text, :string
      add :sender, :string

      add :user_id, references(:user, on_delete: :nilify_all)
      add :video_id, references(:video, on_delete: :delete_all)

      timestamps()
    end
  end
end
