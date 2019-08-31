defmodule Grasstube.Repo do
  use Ecto.Repo,
    otp_app: :grasstube,
    adapter: Ecto.Adapters.Postgres
end
