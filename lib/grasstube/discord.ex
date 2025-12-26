defmodule Grasstube.Instances do
  use Agent

  def start_link(_) do
    Agent.start_link(fn -> %{} end, name: __MODULE__)
  end

  def create(instance_id) do
    if Grasstube.ProcessRegistry.lookup(instance_id, :chat) == :not_found do
      {:ok, r} =
        Nostrum.Api.request(
          :get,
          "/applications/#{Nostrum.Cache.Me.get().id}/activity-instances/#{instance_id}"
        )

      {:ok, r} = Jason.decode(r)

      r["users"]
      |> Enum.at(0)
      |> Grasstube.Room.create_temporary(instance_id)
      |> IO.inspect()
    end
  end
end

defmodule Grasstube.Consumer do
  @behaviour Nostrum.Consumer

  alias Nostrum.Api.Message
  alias Nostrum.Api
  alias Nostrum.Struct.Interaction

  # Ignore any other events
  def handle_event({:INTERACTION_CREATE, interaction, _ws_state}) do
    IO.inspect(interaction)
    Nostrum.Api.Interaction.create_response(interaction, %{type: 12})

    Nostrum.Api.Interaction.create_followup_message(interaction.token, %{
      content: "https://discord.com/activities/1285065779414302782"
    })
  end

  def handle_event(ev), do: :ok
end
