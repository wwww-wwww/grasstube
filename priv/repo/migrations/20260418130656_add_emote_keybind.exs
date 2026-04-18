defmodule Grasstube.Repo.Migrations.AddEmoteKeybind do
  use Ecto.Migration

  def change do
    alter table(:emote) do
      add :keybind, :string
    end
  end
end
