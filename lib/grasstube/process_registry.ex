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
      [{pid, _}] ->
        pid

      _ ->
        :not_found
    end
  end

  def rooms_of(user) do
    Registry.select(__MODULE__, [{{{:"$1", :supervisor}, :"$2", {:"$3", user}}, [], [:"$1"]}])
  end

  def list_rooms() do
    Registry.select(__MODULE__, [{{{:"$1", :supervisor}, :"$2", {:"$3", :"$4"}}, [], [:"$3"]}])
  end

  def create_room(room_name, admin, password) do
    DynamicSupervisor.start_child(
      Grasstube.DynamicSupervisor,
      {Grasstube.RoomSupervisor, room_name: room_name, admin: admin, password: password}
    )
  end

  def close_room(room_name) do
    DynamicSupervisor.stop(lookup(room_name, :supervisor))
    GrasstubeWeb.RoomsLive.update()
  end
end
