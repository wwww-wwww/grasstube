defmodule GrasstubeWeb.UserLive.Settings do
  use GrasstubeWeb, :live_view

  alias Grasstube.Accounts

  @impl true
  def render(assigns) do
    ~H"""
    <.form
      for={@password_form}
      id="password_form"
      action={~p"/user/update-password"}
      method="post"
      phx-change="validate_password"
      phx-submit="update_password"
      phx-trigger-action={@trigger_submit}
    >
      <input
        name={@password_form[:username].name}
        type="hidden"
        id="hidden_user_username"
        spellcheck="false"
        value={@current_username}
      />
      <.input
        field={@password_form[:password]}
        type="password"
        label="New password"
        autocomplete="new-password"
        spellcheck="false"
        required
      />
      <.input
        field={@password_form[:password_confirmation]}
        type="password"
        label="Confirm new password"
        autocomplete="new-password"
        spellcheck="false"
      />
      <.button variant="primary" phx-disable-with="Saving...">
        Save Password
      </.button>
    </.form>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    user = socket.assigns.current_scope.user
    password_changeset = Accounts.change_user_password(user, %{}, hash_password: false)

    socket =
      socket
      |> assign(:current_username, user.username)
      |> assign(:password_form, to_form(password_changeset))
      |> assign(:trigger_submit, false)

    {:ok, socket}
  end

  @impl true
  def handle_event("validate_password", params, socket) do
    %{"user" => user_params} = params

    password_form =
      socket.assigns.current_scope.user
      |> Accounts.change_user_password(user_params, hash_password: false)
      |> Map.put(:action, :validate)
      |> to_form()

    {:noreply, assign(socket, password_form: password_form)}
  end

  @impl true
  def handle_event("update_password", params, socket) do
    %{"user" => user_params} = params
    user = socket.assigns.current_scope.user

    case Accounts.change_user_password(user, user_params) do
      %{valid?: true} = changeset ->
        {:noreply, assign(socket, trigger_submit: true, password_form: to_form(changeset))}

      changeset ->
        {:noreply, assign(socket, password_form: to_form(changeset, action: :insert))}
    end
  end
end
