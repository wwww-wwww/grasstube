defmodule Grasstube.Emote do
  use Ecto.Schema
  import Ecto.Changeset

  schema "emotes" do
    field :emote, :string
    field :url, :string

    belongs_to :user, Grasstube.User,
      references: :username,
      foreign_key: :user_username,
      type: :string

    timestamps()
  end

  @doc false
  def changeset(emote, attrs) do
    emote
    |> cast(attrs, [:emote, :url])
    |> cast_assoc(attrs, [:user])
    |> validate_required([])
  end
end
