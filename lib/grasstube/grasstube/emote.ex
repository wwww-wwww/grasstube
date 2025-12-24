defmodule Grasstube.Emote do
  use Ecto.Schema
  import Ecto.Changeset
  alias Grasstube.Repo

  @allowed_types [
    "image/png",
    "image/gif",
    "image/jpg",
    "image/jpeg",
    "image/webp",
    "image/avif",
    "image/jxl"
  ]

  @max_size 1_000_000

  schema "emotes" do
    field :emote, :string
    field :url, :string
    field :data, :binary
    field :content_type, :string

    belongs_to :user, Grasstube.User,
      references: :username,
      foreign_key: :user_username,
      type: :string

    timestamps()
  end

  @doc false
  def changeset(emote, attrs) do
    emote
    |> cast(attrs, [:emote, :url])
    |> cast_assoc(attrs, [:user])
    |> validate_required([])
  end

  defp check(%__MODULE__{url: url}) do
    case HTTPoison.options(url) do
      {:ok, %HTTPoison.Response{headers: headers, status_code: 200}} ->
        content_type =
          headers
          |> Enum.filter(&(elem(&1, 0) == "Content-Type"))
          |> Enum.at(0)

        content_length =
          headers
          |> Enum.filter(&(elem(&1, 0) == "Content-Length"))
          |> Enum.at(0)

        case {content_type, content_length} do
          {nil, _} ->
            {:error, "can't download from here"}

          {_, nil} ->
            {:error, "can't download from here"}

          {{_, content_type}, content_length} ->
            {content_length, _} = elem(content_length, 1) |> Integer.parse()

            cond do
              !Enum.member?(@allowed_types, content_type) ->
                {:error, {"file type not allowed", content_type}}

              content_length > @max_size ->
                {:error, {"file exceeds limit", content_length, @max_size}}

              true ->
                :ok
            end
        end

      {:ok, %HTTPoison.Response{body: body, status_code: status_code}} ->
        {:error, {status_code, body}}

      err ->
        err
    end
  end

  def download(%__MODULE__{url: url} = e) do
    case :ok do #check(e) do
      :ok ->
        case HTTPoison.get(url) do
          {:ok, %HTTPoison.Response{body: body, headers: headers}} ->
            headers
            |> Enum.filter(&(elem(&1, 0) == "Content-Type"))
            |> Enum.at(0)
            |> case do
              {_, content_type} ->
                {:ok, Ecto.Changeset.change(e, %{content_type: content_type, data: body})}

              resp ->
                {:error, {"bad response?", resp}}
            end

          err ->
            err
        end

      err ->
        err
    end
  end

  # use this to download existing emotes
  def download_all() do
    Grasstube.Repo.all(Grasstube.Emote)
    |> Enum.filter(&(&1.data == nil))
    |> Enum.map(fn e ->
      case download(e) do
        {:ok, cs} -> Repo.update(cs)
        err -> {e, err}
      end
    end)
  end
end
