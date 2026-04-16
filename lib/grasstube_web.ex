defmodule GrasstubeWeb do
  @moduledoc """
  The entrypoint for defining your web interface, such
  as controllers, components, channels, and so on.

  This can be used in your application as:

      use GrasstubeWeb, :controller
      use GrasstubeWeb, :html

  The definitions below will be executed for every controller,
  component, etc, so keep them short and clean, focused
  on imports, uses and aliases.

  Do NOT define functions inside the quoted expressions
  below. Instead, define additional modules and import
  those modules here.
  """

  def static_paths, do: ~w(assets fonts images includes favicon.ico robots.txt)

  def router do
    quote do
      use Phoenix.Router, helpers: false

      # Import common connection and controller functions to use in pipelines
      import Plug.Conn
      import Phoenix.Controller
      import Phoenix.LiveView.Router
    end
  end

  def channel do
    quote do
      use Phoenix.Channel
    end
  end

  def controller do
    quote do
      use Phoenix.Controller, formats: [:html, :json]

      use Gettext, backend: GrasstubeWeb.Gettext

      import Plug.Conn

      unquote(verified_routes())
    end
  end

  def live_view do
    quote do
      use Phoenix.LiveView,
        layout: {GrasstubeWeb.Layouts, :live},
        container: {:div, class: __MODULE__ |> to_string() |> String.split(".") |> Enum.at(-1)}

      unquote(html_helpers())
    end
  end

  def live_component do
    quote do
      use Phoenix.LiveComponent

      defp id(n) when is_integer(n), do: to_string(n)

      defp id(n), do: n

      def update_assigns(n, opts), do: send_update(__MODULE__, [{:id, id(n)} | opts])

      def subscribe_once(socket, topic) do
        key = String.to_atom("subscribe:#{topic}")

        if connected?(socket) do
          if socket.assigns |> Map.get(key) || false do
            socket
          else
            GrasstubeWeb.Endpoint.subscribe(topic)
            assign(socket, key, true)
          end
        else
          socket
        end
      end

      unquote(html_helpers())
    end
  end

  def html do
    quote do
      use Phoenix.Component

      # Import convenience functions from controllers
      import Phoenix.Controller,
        only: [get_csrf_token: 0, view_module: 1, view_template: 1]

      # Include general helpers for rendering HTML
      unquote(html_helpers())
    end
  end

  defp html_helpers do
    quote do
      # Translation
      use Gettext, backend: GrasstubeWeb.Gettext

      # HTML escaping functionality
      import Phoenix.HTML
      # Core UI components
      import GrasstubeWeb.CoreComponents

      # Common modules used in templates
      alias Phoenix.LiveView.JS
      alias GrasstubeWeb.Layouts

      # Routes generation with the ~p sigil
      unquote(verified_routes())
    end
  end

  def verified_routes do
    quote do
      use Phoenix.VerifiedRoutes,
        endpoint: GrasstubeWeb.Endpoint,
        router: GrasstubeWeb.Router,
        statics: GrasstubeWeb.static_paths()
    end
  end

  @doc """
  When used, dispatch to the appropriate controller/live_view/etc.
  """
  defmacro __using__(which) when is_atom(which) do
    apply(__MODULE__, which, [])
  end
end
