defmodule GrasstubeWeb.PageView do
  use GrasstubeWeb, :view

  def page_name(%{view: view}) do
    view |> to_string() |> String.split(".") |> Enum.at(-1)
  end

  def seconds_to_string(seconds) when is_float(seconds) do
    seconds
    |> Float.ceil()
    |> trunc()
    |> seconds_to_string()
  end

  def seconds_to_string(seconds) when is_number(seconds) do
    seconds
    |> DateTime.from_unix!(:second)
    |> to_string()
    |> String.slice(-9..-2)
  end

  def seconds_to_string(_), do: "00:00:00"

  def text_repeat_mode(repeat_mode) do
    case repeat_mode do
      :playlist -> gettext("playlist")
      :track -> gettext("track")
      :none -> gettext("none")
    end
  end

  def to_flag_emoji(nil), do: nil

  def to_flag_emoji(code) do
    code
    |> String.upcase()
    |> String.to_charlist()
    |> Enum.map(&(&1 + 127_397))
    |> to_string()
  end
end
