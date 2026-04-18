defmodule GrasstubeWeb.PollComponent do
  use GrasstubeWeb, :live_component

  import Ecto.Query, only: [from: 2]

  alias Grasstube.{PollVote, User, Repo}
  alias GrasstubeWeb.Endpoint

  def render(assigns) do
    ~H"""
    <div class="PollComponent">
      <div>
        <span>{@poll.name}</span><button phx-click="delete" phx-target={@myself} class="close"></button>
      </div>
      <div>
        <div :for={{o, i} <- Enum.with_index(@poll.options)}>
          <button
            phx-click="select_option"
            phx-target={@myself}
            phx-value-option={i}
            disabled={
              @current_scope.user != nil and
                Enum.any?(@votes[i] || [], &(@current_scope.user.id == &1.user_id))
            }
          >
            {(@votes[i] || []) |> length}
          </button>
          <span>{o}</span>
        </div>
      </div>
      <div>{@poll.inserted_at}</div>
    </div>
    """
  end

  def mount(socket) do
    {:ok, socket}
  end

  def update(assigns, socket) do
    votes =
      (assigns[:votes] || assigns.poll.votes)
      |> Enum.group_by(& &1.option)
      |> Map.new()

    socket =
      socket
      |> subscribe_once("poll:#{assigns.id}")
      |> assign(assigns)
      |> assign(votes: votes)

    {:ok, socket}
  end

  def handle_event("select_option", %{"option" => i}, socket) do
    poll_id = socket.assigns.poll.id
    {i, _} = Integer.parse(i)

    with %{user: %User{id: user_id}} <- socket.assigns.current_scope do
      Repo.transact(fn ->
        from(v in PollVote, where: v.poll_id == ^poll_id and v.user_id == ^user_id)
        |> Repo.one()
        |> case do
          nil ->
            %PollVote{poll_id: poll_id, user_id: user_id, option: i} |> Repo.insert()

          v ->
            Ecto.Changeset.change(v, %{option: i}) |> Repo.update()
        end
      end)

      votes =
        from(v in PollVote, where: v.poll_id == ^poll_id)
        |> Repo.all()

      Endpoint.broadcast("poll:#{poll_id}", "votes", votes)
    else
      _ ->
        nil
    end

    {:noreply, socket}
  end

  def handle_event("delete", _params, socket) do
    Repo.delete(socket.assigns.poll)

    GrasstubeWeb.RoomLive.update_polls(socket.assigns.poll.room_id)
    {:noreply, socket}
  end

  defmacro __using__(_opts) do
    quote do
      def handle_info(%{topic: "poll:" <> id, event: "votes", payload: votes}, socket) do
        GrasstubeWeb.PollComponent.update_assigns(id, votes: votes)
        {:noreply, socket}
      end
    end
  end
end
