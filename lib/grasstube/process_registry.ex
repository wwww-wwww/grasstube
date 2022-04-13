defmodule Grasstube.ProcessRegistry do
  def start_link do
    Registry.start_link(keys: :unique, name: __MODULE__)
  end

  def via_tuple({room_name, key}, admin \\ nil) do
    {:via, Registry, {__MODULE__, {room_name |> String.downcase(), key}, {room_name, admin}}}
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

  def rooms_of(user) when is_bitstring(user) do
    Registry.select(__MODULE__, [{{{:"$1", :supervisor}, :"$2", {:"$3", user}}, [], [:"$1"]}])
  end

  def rooms_of(%{username: username}), do: rooms_of(username)

  def rooms_of(_), do: []

  def list_rooms() do
    Registry.select(__MODULE__, [{{{:"$1", :supervisor}, :"$2", {:"$3", :"$4"}}, [], [:"$3"]}])
  end

  def create_room(%Grasstube.User{} = user, room_name, password) do
    cond do
      length(rooms_of(user)) > 0 ->
        {:error, "User already has a room"}

      String.length(room_name) == 0 ->
        {:error, "Room name is too short"}

      true ->
        case create_room(user.username, room_name, password) do
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
    end
  end

  def create_room(admin, room_name, password) when is_bitstring(admin) do
    DynamicSupervisor.start_child(
      Grasstube.DynamicSupervisor,
      {Grasstube.RoomSupervisor, admin: admin, room_name: room_name, password: password}
    )
  end

  def create_room(_, _, _), do: {:error, "Admin must be provided"}

  def close_room(room_name) do
    DynamicSupervisor.stop(lookup(room_name, :supervisor))
    GrasstubeWeb.RoomsLive.update()
  end
end
