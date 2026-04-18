defmodule Grasstube.ProcessRegistry do
  def start_link do
    Registry.start_link(keys: :unique, name: __MODULE__)
  end

  def via_tuple(module, key), do: {:via, Registry, {__MODULE__, {module, key}}}

  def child_spec(_) do
    Supervisor.child_spec(
      Registry,
      id: __MODULE__,
      start: {__MODULE__, :start_link, []}
    )
  end

  def get(id, module), do: lookup(id, module) |> module.get()

  def lookup(id, module) do
    case Registry.lookup(__MODULE__, {module, id}) do
      [{pid, _}] -> pid
      _ -> :not_found
    end
  end

  def list_rooms() do
    Registry.select(__MODULE__, [{{{Grasstube.RoomSupervisor, :"$1"}, :"$2", :"$3"}, [], [:"$1"]}])
  end

  def start_room(room) do
    DynamicSupervisor.start_child(
      Grasstube.DynamicSupervisor,
      {Grasstube.RoomSupervisor, room: room}
    )
  end
end
