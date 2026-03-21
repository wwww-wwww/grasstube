defmodule GrasstubeWeb.ChatComponent do
  use GrasstubeWeb, :live_component

  alias Grasstube.{ChatAgent}

  def render(assigns) do
    # IO.inspect(assigns)

    ~H"""
    <div class="ChatComponent" id="ChatComponent_container" phx-hook="chat" phx-target={@myself}>
      <meta name="chat_room" content={@room.id}>

      <div class="top">
        <div id="chat_userlist">
          <%= for {_id, user} <- [] do %>
          <div>
            <%= if user.member do %>
              <%= user.nickname %>
            <% else %>
              <%= user.metas |> Enum.at(0) |> Map.get(:nickname) %>
            <% end %>
          </div>
          <% end %>
        </div>
        <div id="chat_messages" phx-update="ignore">
          <%= render_history(@room) %>
        </div>
      </div>
      <div id="chat_emotes" phx-update="ignore" style="display: none">
        <%= for %{emote: emote, id: id} <- @emotes do %>
        <img src={Routes.user_path(@socket, :emote, id)} alt={emote} title={emote}>
        <% end %>
      </div>
      <div id="chat_input_container" phx-update="ignore">
        <input id="chat_input">
        <button id="chat_btn_emotes" class="square">🙂</button>
      </div>
    </div>
    """
  end

  def history_message(msg, name, last_name) do
    assigns = %{
      msg: msg,
      name: name,
      last_name: last_name
    }

    ~H"""
    <div class="message">
      <%= if @last_name != @name do %>
      <span class="message_user"><%= @name %></span>
      <% end %>

      <div class="message_content"><%= raw(@msg) %></div>
    </div>
    """
  end

  def render_history(room) do
    Grasstube.ProcessRegistry.lookup(room.id, ChatAgent)
    |> ChatAgent.get_history()
    |> Enum.reverse()
    |> Enum.reduce({[], ""}, fn %{msg: msg, name: name}, {acc, last_name} ->
      {acc ++
         [
           history_message(msg, name, last_name)
           |> Phoenix.HTML.Safe.to_iodata()
           |> List.to_string()
           |> raw()
         ], name}
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  def update(assigns, socket) do
    socket =
      assign(socket, assigns)
      |> subscribe_once("chat:#{assigns.room.id}")

    {:ok, socket}
  end

  def handle_event("chat", %{"message" => message}, socket) do
    message = String.trim(message)

    if String.length(message) > 0 do
      ChatAgent.chat(socket.assigns.chat_pid, {socket, self()}, message)
    end

    {:noreply, socket}
  end
end
