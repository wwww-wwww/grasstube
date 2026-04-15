defmodule Grasstube.Video do
  use Ecto.Schema
  import Ecto.Changeset

  schema "video" do
    field :title, :string
    field :type, :string
    field :video_url, :string
    field :subtitles_url, :string
    field :alts, {:map, :string}
    field :duration, :float
    field :ready, :boolean, default: false
    field :order, :integer

    belongs_to :room, Grasstube.Room

    timestamps()
  end
end
