defmodule GrasstubeWeb.RoomsLive do
  use Phoenix.LiveView

  def render(assigns) do
    GrasstubeWeb.PageView.render("roomlist.html", assigns)
  end

  def get_rooms() do
    room_names = Grasstube.ProcessRegistry.list_rooms()
    room_names |> Enum.reduce([], fn name, acc ->
      case Grasstube.ProcessRegistry.lookup(name, :chat) do
        :not_found ->
          acc
        chat ->
          [{name, GrasstubeWeb.ChatAgent.get_users(chat) |> length} | acc]
      end
    end) |> Enum.sort_by(&{-elem(&1, 1), elem(&1, 0)})
  end

  def mount(_session, socket) do
    if connected?(socket), do: Process.send_after(self(), :tick, 1000)
    {:ok, assign(socket, rooms: get_rooms())}
  end

  def handle_info(:tick, socket) do
    Process.send_after(self(), :tick, 1000)
    {:noreply, assign(socket, rooms: get_rooms())}
  end
end
