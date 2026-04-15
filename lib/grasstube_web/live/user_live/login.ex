defmodule GrasstubeWeb.UserLive.Login do
  use GrasstubeWeb, :live_view

  @impl true
  def render(assigns) do
    ~H"""
    <h1>Login</h1>
    <div class="mx-auto max-w-sm space-y-4">
      <.form
        :let={f}
        for={@form}
        id="login_form_password"
        action={~p"/user/log-in"}
        phx-submit="submit_password"
        phx-trigger-action={@trigger_submit}
      >
        <.input
          readonly={!!@current_scope.user}
          field={f[:username]}
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
          autocomplete="current-password"
          spellcheck="false"
          required
        />
        <.button class="btn btn-primary w-full" name={@form[:remember_me].name} value="true">
          Log in
        </.button>
      </.form>
    </div>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    username =
      Phoenix.Flash.get(socket.assigns.flash, :username) ||
        get_in(socket.assigns, [:current_scope, Access.key(:user), Access.key(:username)])

    form = to_form(%{"username" => username}, as: "user")

    {:ok, assign(socket, form: form, trigger_submit: false)}
  end

  @impl true
  def handle_event("submit_password", _params, socket) do
    {:noreply, assign(socket, :trigger_submit, true)}
  end
end
