defmodule Grasstube.Guardian do
  use Guardian, otp_app: :grasstube

  def subject_for_token(user, _claims) do
    {:ok, to_string(user.username)}
  end

  def resource_from_claims(claims) do
    user = Grasstube.Repo.get(Grasstube.User, claims["sub"])
    {:ok, user}
  end
end
