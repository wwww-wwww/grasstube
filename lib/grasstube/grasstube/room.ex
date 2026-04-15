defmodule Grasstube.Room do
  use Ecto.Schema
  import Ecto.Changeset

  schema "room" do
    field :title, :string
    field :password, :string, default: ""
    field :public_controls, :boolean, default: false

    has_many :videos, Grasstube.Video

    # many_to_many :mods, Grasstube.User,
    #   join_through: Grasstube.RoomsMods,
    #   join_keys: [room_id: :id, user_username: :username]

    # many_to_many :emotelists, Grasstube.User,
    #   join_through: Grasstube.RoomsEmotelists,
    #   join_keys: [room_id: :id, user_username: :username]

    belongs_to :user, Grasstube.User

    timestamps()
  end

  def changeset(struct, attrs \\ %{}) do
    struct
    |> cast(attrs, [:title, :password])
    |> validate_required([:title])
    |> unique_constraint(:title)
  end
end
