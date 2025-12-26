defmodule Grasstube.ProcessRegistry do
  alias Grasstube.{Repo, User, Room}

  def start_link do
    Registry.start_link(keys: :unique, name: __MODULE__)
  end

  def via_tuple({room_name, key}) do
    {:via, Registry, {__MODULE__, {room_name |> String.downcase(), key}, room_name}}
  end

  def child_spec(_) do
    Supervisor.child_spec(
      Registry,
      id: __MODULE__,
      start: {__MODULE__, :start_link, []}
    )
  end

  def lookup(room_name, channel) do
    case Registry.lookup(__MODULE__, {room_name |> String.downcase(), channel}) do
      [{pid, _}] -> pid
      _ -> :not_found
    end
  end

  def list_rooms() do
    Registry.select(__MODULE__, [{{{:"$1", :supervisor}, :"$2", :"$3"}, [], [:"$3"]}])
  end

  def create_room(%Grasstube.User{} = user, room_name, password) do
    user = Repo.preload(user, :rooms)

    Ecto.build_assoc(user, :rooms)
    |> Room.changeset(%{title: room_name, password: password})
    |> Repo.insert()
    |> case do
      {:ok, room} ->
        room
        |> Repo.preload([:user, :mods, [emotelists: :emotes]])
        |> start_room()
        |> case do
          {:ok, _} ->
            GrasstubeWeb.RoomsLive.update()
            {:ok, room_name}

          {:error, {reason, _}} ->
            case reason do
              :already_started ->
                {:error, "A room already exists with this name"}

              _ ->
                {:error, "Error creating room #{inspect(reason)}"}
            end
        end

      {:error, %{errors: errors}} ->
        {:error, inspect(errors)}

      err ->
        {:error, inspect(err)}
    end
  end

  def create_room(admin, room_name, password) when is_bitstring(admin) do
    case Repo.get(User, admin) do
      nil -> nil
      %User{} = user -> create_room(user, room_name, password)
    end
  end

  def create_room(opts) do
    Room.changeset(%Room{}, opts)
    |> Repo.insert()
    |> case do
      {:ok, room} ->
        room
        |> Repo.preload([:user, :mods, [emotelists: :emotes]])
        |> start_room()
        |> case do
          {:ok, _} ->
            GrasstubeWeb.RoomsLive.update()
            :ok

          {:error, {reason, _}} ->
            case reason do
              :already_started ->
                {:error, "A room already exists with this name"}

              _ ->
                {:error, "Error creating room #{inspect(reason)}"}
            end
        end

      {:error, %{errors: errors}} ->
        {:error, inspect(errors)}

      err ->
        {:error, inspect(err)}
    end
  end

  def create_room(_, _, _), do: {:error, "Admin must be provided"}

  def start_room(room) do
    DynamicSupervisor.start_child(
      Grasstube.DynamicSupervisor,
      {Grasstube.RoomSupervisor, room: room}
    )
  end

  def close_room(room_name) do
    DynamicSupervisor.stop(lookup(room_name, :supervisor))
    GrasstubeWeb.RoomsLive.update()
  end

  def delete_room(room) when is_bitstring(room), do: delete_room(Repo.get_by(Room, title: room))

  def delete_room(room) do
    Repo.delete(room)
    close_room(room.title)
  end
end
