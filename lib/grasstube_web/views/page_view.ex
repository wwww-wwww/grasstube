defmodule GrasstubeWeb.PageView do
  use GrasstubeWeb, :view

  def page_name(%{view: view}) do
    view |> to_string() |> String.split(".") |> Enum.at(-1)
  end

  def render_history(history, assigns) do
    history
    |> Enum.reverse()
    |> Enum.reduce({[], ""}, fn %{msg: msg, name: name}, {acc, last_name} ->
      {acc ++
         [
           ~H"""
           <div class="message">
             <%= if last_name != name do %>
             <span class="message_user"><%= name %></span>
             <% end %>

             <div class="message_content"><%= raw(msg) %></div>
           </div>
           """
           |> Phoenix.HTML.Safe.to_iodata()
           |> List.to_string()
           |> raw()
         ], name}
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  def seconds_to_string(seconds) when is_float(seconds) do
    seconds
    |> Float.ceil()
    |> trunc()
    |> seconds_to_string()
  end

  def seconds_to_string(seconds) do
    seconds
    |> DateTime.from_unix!(:second)
    |> to_string()
    |> String.slice(-9..-2)
  end

  def text_repeat_mode(repeat_mode) do
    case repeat_mode do
      :playlist -> gettext("playlist")
      :track -> gettext("track")
      :none -> gettext("none")
    end
  end
end
