defmodule Grasstube.RoomsMods do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "rooms_mods" do
    belongs_to(:room, Grasstube.Room)

    belongs_to(:user, Grasstube.User,
      references: :username,
      foreign_key: :user_username,
      type: :string
    )

    timestamps()
  end

  def changeset(struct, params \\ %{}) do
    struct
    |> cast(params, [:user_username, :room_id])
    |> validate_required([:user_username, :room_id])
    |> unique_constraint(:unique, name: :rooms_mods_room_id_user_username_index)
  end
end

defmodule Grasstube.RoomsEmotelists do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  schema "rooms_emotelists" do
    belongs_to(:room, Grasstube.Room)

    belongs_to(:user, Grasstube.User,
      references: :username,
      foreign_key: :user_username,
      type: :string
    )

    timestamps()
  end

  def changeset(struct, params \\ %{}) do
    struct
    |> cast(params, [:user_username, :room_id])
    |> validate_required([:user_username, :room_id])
    |> unique_constraint(:unique, name: :rooms_emotelists_room_id_user_username_index)
  end
end
