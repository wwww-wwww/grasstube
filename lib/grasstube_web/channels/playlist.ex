defmodule GrasstubeWeb.PlaylistChannel do
  use Phoenix.Channel

  alias Grasstube.{ChatAgent, PlaylistAgent, VideoAgent, ProcessRegistry}
  alias GrasstubeWeb.Endpoint

  def join("playlist:" <> room_name, %{"password" => password}, socket) do
    case ProcessRegistry.lookup(room_name, :playlist) do
      :not_found ->
        {:error, "no room"}

      _ ->
        case ChatAgent.auth(socket, room_name, password) do
          {:ok, socket} ->
            if not String.starts_with?(socket.assigns.user_id, "$") do
              :ok = Endpoint.subscribe("user:#{room_name}:#{socket.assigns.user_id}")
            end

            send(self(), {:after_join, nil})
            {:ok, socket}

          resp ->
            resp
        end
    end
  end

  def join(topic, %{}, socket), do: join(topic, %{"password" => ""}, socket)

  def handle_info({:after_join, _}, socket) do
    "playlist:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      push(socket, "controls", %{})
    end

    playlist =
      ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.get_playlist()
      |> Enum.map(
        &Map.put(
          &1,
          :url,
          if(&1.type == "yt",
            do: URI.merge(URI.parse("https://youtu.be/"), &1.url) |> to_string(),
            else: ""
          )
        )
      )

    push(socket, "playlist", %{playlist: playlist})

    ProcessRegistry.lookup(room_name, :video)
    |> VideoAgent.get_current_video()
    |> case do
      :nothing -> nil
      current -> push(socket, "current", %{id: current.id})
    end

    {:noreply, socket}
  end

  def handle_info(
        %Phoenix.Socket.Broadcast{topic: "user:" <> _, event: ev, payload: payload},
        socket
      ) do
    push(socket, ev, payload)
    {:noreply, socket}
  end

  def handle_info({:DOWN, _, :process, _pid, _reason}, socket) do
    {:noreply, socket}
  end

  def handle_info({_ref, _}, socket) do
    {:noreply, socket}
  end

  def handle_in(
        "q_add",
        %{"title" => title, "url" => user_url, "sub" => sub, "alts" => alts},
        socket
      ) do
    "playlist:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      alts =
        case Jason.decode(alts) do
          {:ok, alts} -> alts
          {:error, _} -> %{}
        end

      ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.add_queue(title, user_url, sub, alts)
    end

    {:noreply, socket}
  end

  def handle_in("q_del", %{"id" => id}, socket) do
    "playlist:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.remove_queue(id)
    end

    {:noreply, socket}
  end

  def handle_in("q_order", %{"order" => order}, socket) do
    "playlist:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.set_queue(order)
    end

    {:noreply, socket}
  end

  def handle_in("q_set", %{"id" => id}, socket) do
    "playlist:" <> room_name = socket.topic

    ProcessRegistry.lookup(room_name, :chat)
    |> ChatAgent.controls?(socket)
    |> if do
      ProcessRegistry.lookup(room_name, :playlist)
      |> PlaylistAgent.get_video(id)
      |> case do
        :not_found ->
          nil

        vid ->
          ProcessRegistry.lookup(room_name, :video)
          |> VideoAgent.set_current_video(vid)
      end
    end

    {:noreply, socket}
  end
end
