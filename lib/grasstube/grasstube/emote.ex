defmodule Grasstube.Emote do
  use Ecto.Schema

  schema "emote" do
    field :name, :string
    belongs_to :user, Grasstube.User

    field :keybind, :string

    timestamps()
  end
end
