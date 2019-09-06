defmodule GrasstubeWeb.ErrorView do
  use GrasstubeWeb, :view

  import Phoenix.Controller, only: [action_name: 1]

  def template_not_found(template, _assigns) do
    Phoenix.Controller.status_message_from_template(template)
  end
end
