defmodule Grasstube.Video do
  use Ecto.Schema
  import Ecto.Changeset

  schema "videos" do
    field :title, :string
    field :type, :string
    field :url, :string
    field :sub, :string
    field :alts, {:map, :string}
    field :duration, :float
    field :ready, :boolean, default: false

    belongs_to :room, Grasstube.Room

    timestamps()
  end

  def changeset(struct, params \\ %{}) do
    struct
    |> cast(params, [:title, :type, :url, :sub, :alts, :duration, :ready])
    |> validate_required([:url])
  end
end
