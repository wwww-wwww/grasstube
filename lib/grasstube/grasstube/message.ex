defmodule Grasstube.Message do
  use Ecto.Schema

  schema "message" do
    field :text, :string
    field :sender, :string
    field :time, :float

    belongs_to :user, Grasstube.User
    belongs_to :video, Grasstube.Video

    timestamps()
  end
end
