defmodule GrasstubeWeb.UserLive.Registration do
  use GrasstubeWeb, :live_view

  alias Grasstube.Accounts
  alias Grasstube.User

  @impl true
  def render(assigns) do
    ~H"""
    <h1>Register</h1>
    <.form for={@form} id="registration_form" phx-submit="save" phx-change="validate">
      <.input
        field={@form[:username]}
        type="username"
        label="Username"
        autocomplete="username"
        spellcheck="false"
        required
        phx-mounted={JS.focus()}
      />
      <.input
        field={@form[:password]}
        type="password"
        label="Password"
        autocomplete="new-password"
        spellcheck="false"
        required
      />
      <.input
        field={@form[:password_confirmation]}
        type="password"
        label="Confirm password"
        autocomplete="new-password"
        spellcheck="false"
        required
      />

      <.button phx-disable-with="Creating account..." class="btn btn-primary w-full">
        Register
      </.button>
    </.form>
    """
  end

  @impl true
  def mount(_params, _session, %{assigns: %{current_scope: %{user: user}}} = socket)
      when not is_nil(user) do
    {:ok, redirect(socket, to: GrasstubeWeb.UserAuth.signed_in_path(socket))}
  end

  def mount(_params, _session, socket) do
    changeset = User.username_password_changeset(%User{}, %{})

    {:ok, assign_form(socket, changeset), temporary_assigns: [form: nil]}
  end

  @impl true
  def handle_event("save", %{"user" => user_params}, socket) do
    case Accounts.register_user(user_params) do
      {:ok, _user} ->
        {:noreply,
         socket
         |> put_flash(:info, "User created")
         |> push_navigate(to: ~p"/user/log-in")}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign_form(socket, changeset)}
    end
  end

  def handle_event("validate", %{"user" => user_params}, socket) do
    changeset = User.username_password_changeset(%User{}, user_params, hash_password: false)
    {:noreply, assign_form(socket, Map.put(changeset, :action, :validate))}
  end

  defp assign_form(socket, %Ecto.Changeset{} = changeset) do
    form = to_form(changeset, as: "user")
    assign(socket, form: form)
  end
end
