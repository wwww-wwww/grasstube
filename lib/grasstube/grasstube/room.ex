defmodule Grasstube.Room do
  use Ecto.Schema
  import Ecto.Changeset

  schema "room" do
    field :title, :string
    field :password, :string, default: ""
    field :public_controls, :boolean, default: false
    field :media_directories, {:array, :string}
    field :autopause, :boolean, default: false

    has_many :videos, Grasstube.Video

    belongs_to :user, Grasstube.User

    many_to_many :mods, Grasstube.User, join_through: Grasstube.RoomMod

    timestamps()
  end

  def changeset(struct, attrs \\ %{}) do
    struct
    |> cast(attrs, [:title, :password])
    |> validate_required([:title])
    |> validate_format(:title, ~r/^[a-zA-Z0-9_\-]+$/, message: "a-zA-Z0-9_\-")
    |> unique_constraint(:title)
  end
end

defmodule Grasstube.RoomMod do
  use Ecto.Schema

  schema "room_mod" do
    belongs_to :room, Grasstube.Room
    belongs_to :user, Grasstube.User
  end
end
