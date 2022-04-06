defmodule GrasstubeWeb.PageView do
  use GrasstubeWeb, :view

  def page_name(%{view: view}) do
    view |> to_string() |> String.split(".") |> Enum.at(-1)
  end

  def render_history(history) do
    history
    |> Enum.reverse()
    |> Enum.reduce({[], ""}, fn %{msg: msg, name: name}, {acc, last_name} ->
      {acc ++
         [
           ~E"""
           <div class="message">
             <%= if last_name != name do %>
             <span class="message_user"><%= name %></span>
             <% end %>

             <div class="message_content"><%= raw(msg) %></div>
           </div>
           """
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
    |> String.slice(11..-2)
  end
end
