defmodule Grasstube.Poll do
  use Ecto.Schema

  schema "poll" do
    field :name, :string
    field :options, {:array, :string}
    belongs_to :room, Grasstube.Room

    has_many :votes, Grasstube.PollVote

    timestamps()
  end
end

defmodule Grasstube.PollVote do
  use Ecto.Schema

  schema "user_poll" do
    belongs_to :user, Grasstube.User
    belongs_to :poll, Grasstube.Poll
    field :option, :integer
  end
end
