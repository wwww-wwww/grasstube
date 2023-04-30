defmodule Grasstube.Room do
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query, only: [from: 2]

  alias Grasstube.{ChatAgent, Repo, Room, RoomsMods, RoomsEmotelists, User}

  schema "rooms" do
    field :title, :string
    field :password, :string, default: ""
    field :motd, :string, default: ""
    field :public_controls, :boolean, default: false
    field :attributes, {:map, :string}
    field :queue, {:array, :id}, default: []

    has_many :videos, Grasstube.Video

    many_to_many :mods, Grasstube.User,
      join_through: Grasstube.RoomsMods,
      join_keys: [room_id: :id, user_username: :username]

    many_to_many :emotelists, Grasstube.User,
      join_through: Grasstube.RoomsEmotelists,
      join_keys: [room_id: :id, user_username: :username]

    belongs_to :user, Grasstube.User,
      references: :username,
      foreign_key: :user_username,
      type: :string

    timestamps()
  end

  def changeset(struct, params \\ %{}) do
    struct
    |> cast(params, [:title, :password, :motd, :public_controls, :attributes, :queue])
    |> validate_required([:title, :user_username])
    |> unique_constraint(:title)
  end

  def get_room(room) when is_bitstring(room), do: Repo.get_by(Room, title: room)
  def get_room(%Room{} = room), do: room

  def add_mod(room, user) when is_bitstring(room),
    do: add_mod(get_room(room), user)

  def add_mod(room, user) when is_bitstring(user),
    do: add_mod(room, User.get_user(user))

  def add_mod(%Room{id: room_id, title: room_name} = room, %User{username: username}) do
    if Repo.preload(room, [:user]).user.username == username do
      {:error, "user is the owner of this room"}
    else
      RoomsMods.changeset(%RoomsMods{}, %{
        user_username: username,
        room_id: room_id
      })
      |> Repo.insert()
      |> case do
        {:ok, _} ->
          GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
          ChatAgent.reload_room(room)
          :ok

        err ->
          err
      end
    end
  end

  def add_mod(nil, _), do: {:error, "Room does not exist"}
  def add_mod(_, nil), do: {:error, "User does not exist"}

  def remove_mod(room, user) when is_bitstring(room),
    do: remove_mod(get_room(room), user)

  def remove_mod(room, user) when is_bitstring(user),
    do: remove_mod(room, User.get_user(user))

  def remove_mod(%Room{id: room_id, title: room_name} = room, %User{username: username}) do
    from(r in RoomsMods, where: r.user_username == ^username and r.room_id == ^room_id)
    |> Repo.delete_all()
    |> case do
      {0, _} ->
        :fail

      {_, _} ->
        GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
        ChatAgent.reload_room(room)
        :ok

      err ->
        err
    end
  end

  def remove_mod(_, _), do: nil

  def add_emotelist(room, user) when is_bitstring(room),
    do: add_emotelist(get_room(room), user)

  def add_emotelist(room, user) when is_bitstring(user),
    do: add_emotelist(room, User.get_user(String.trim(user)))

  def add_emotelist(%Room{id: room_id, title: room_name} = room, %User{username: username}) do
    RoomsEmotelists.changeset(%RoomsEmotelists{}, %{
      user_username: username,
      room_id: room_id
    })
    |> Repo.insert()
    |> case do
      {:ok, _} ->
        GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
        ChatAgent.reload_room(room)
        :ok

      err ->
        err
    end
  end

  def add_emotelist(nil, _), do: {:error, "Room does not exist"}
  def add_emotelist(_, nil), do: {:error, "User does not exist"}

  def remove_emotelist(room, user) when is_bitstring(room),
    do: remove_emotelist(get_room(room), user)

  def remove_emotelist(room, user) when is_bitstring(user),
    do: remove_emotelist(room, User.get_user(user))

  def remove_emotelist(%Room{id: room_id, title: room_name} = room, %User{username: username}) do
    from(r in RoomsEmotelists, where: r.user_username == ^username and r.room_id == ^room_id)
    |> Repo.delete_all()
    |> case do
      {0, _} ->
        :fail

      {_, _} ->
        GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
        ChatAgent.reload_room(room)
        :ok

      err ->
        err
    end
  end

  def remove_emotelist(_, _), do: nil

  def set_password(room, password) when is_bitstring(room),
    do: set_password(get_room(room), password)

  def set_password(%Room{title: room_name} = room, password) do
    changeset(room, %{password: password})
    |> Repo.update()

    GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
    ChatAgent.reload_room(room)
    GrasstubeWeb.RoomsLive.update()
  end

  def set_motd(room, motd) when is_bitstring(room), do: set_motd(get_room(room), motd)

  def set_motd(%Room{title: room_name} = room, motd) do
    changeset(room, %{motd: String.trim(motd)})
    |> Repo.update()

    GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
    ChatAgent.reload_room(room)
  end

  def set_public_controls(room, public_controls) when is_bitstring(room),
    do: set_public_controls(get_room(room), public_controls)

  def set_public_controls(%Room{title: room_name} = room, public_controls) do
    changeset(room, %{public_controls: public_controls})
    |> Repo.update()

    ChatAgent.reload_room(room)

    GrasstubeWeb.Endpoint.broadcast("video:#{room_name}", "controls", %{})
    GrasstubeWeb.Endpoint.broadcast("playlist:#{room_name}", "controls", %{})
    GrasstubeWeb.Endpoint.broadcast("polls:#{room_name}", "controls", %{})
    GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
  end

  def set_script(room, key, value) when is_bitstring(room),
    do: set_script(get_room(room), key, value)

  def set_script(%Room{title: room_name} = room, key, value) do
    room = Repo.get(Room, room.id)

    changeset(room, %{attributes: Map.put(room.attributes || %{}, key, value)})
    |> Repo.update()

    ChatAgent.reload_room(room)
    GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
  end

  def remove_script(room, key) when is_bitstring(room), do: remove_script(get_room(room), key)

  def remove_script(%Room{title: room_name} = room, key) do
    room = Repo.get(Room, room.id)

    changeset(room, %{attributes: Map.delete(room.attributes || %{}, key)})
    |> Repo.update()

    ChatAgent.reload_room(room)
    GrasstubeWeb.Endpoint.broadcast(room_name, "details", %{})
  end

  def reload_emotelist(%User{username: username}) do
    from(el in Grasstube.RoomsEmotelists, where: el.user_username == ^username)
    |> Repo.all()
    |> Repo.preload(:room)
    |> Enum.map(& &1.room)
    |> Enum.each(&Grasstube.ChatAgent.reload_room/1)
  end
end
