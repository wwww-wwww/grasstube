defmodule GrasstubeWeb do
  def controller do
    quote do
      use Phoenix.Controller, namespace: GrasstubeWeb

      import Plug.Conn
      import GrasstubeWeb.Gettext
      import Phoenix.LiveView.Controller, only: [live_render: 3]
      alias GrasstubeWeb.Router.Helpers, as: Routes
    end
  end

  def view do
    quote do
      use Phoenix.View,
        root: "lib/grasstube_web/templates",
        namespace: GrasstubeWeb

      # Import convenience functions from controllers
      import Phoenix.Controller, only: [get_flash: 1, get_flash: 2, view_module: 1]

      # Use all HTML functionality (forms, tags, etc)
      use Phoenix.HTML

      import GrasstubeWeb.ErrorHelpers
      import GrasstubeWeb.Gettext
      alias GrasstubeWeb.Router.Helpers, as: Routes

      import Phoenix.LiveView, only: [live_render: 2, live_render: 3, live_link: 1, live_link: 2]
    end
  end

  def router do
    quote do
      use Phoenix.Router
      import Plug.Conn
      import Phoenix.Controller
      import Phoenix.LiveView.Router
    end
  end

  def channel do
    quote do
      use Phoenix.Channel
      import GrasstubeWeb.Gettext
    end
  end

  @doc """
  When used, dispatch to the appropriate controller/view/etc.
  """
  defmacro __using__(which) when is_atom(which) do
    apply(__MODULE__, which, [])
  end
end
