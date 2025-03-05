defmodule GrasstubeWeb.UserAuth do
  import Plug.Conn
  import Phoenix.Controller

  alias Grasstube.Accounts
  alias GrasstubeWeb.Router.Helpers, as: Routes

  # Make the remember me cookie valid for 60 days.
  # If you want bump or reduce this value, also change
  # the token expiry itself in UserToken.
  @max_age 60 * 60 * 24 * 365
  @remember_me_cookie "_live_booru_web_user_remember_me"
  @remember_me_options [sign: true, max_age: @max_age, same_site: "Lax"]

  def on_mount(:default, _, %{"user_token" => token}, socket) do
    {:cont,
     Phoenix.Component.assign_new(socket, :current_user, fn ->
       case Accounts.get_user_by_session_token(token) do
         nil -> "$" <> GrasstubeWeb.UserSocket.new_id()
         user -> user
       end
     end)}
  end

  def on_mount(:default, _, _, socket) do
    {:cont,
     Phoenix.Component.assign_new(socket, :current_user, fn ->
       "$" <> GrasstubeWeb.UserSocket.new_id()
     end)}
  end

  @doc """
  Logs the user in.

  It renews the session ID and clears the whole session
  to avoid fixation attacks. See the renew_session
  function to customize this behaviour.

  It also sets a `:live_socket_id` key in the session,
  so LiveView sessions are identified and automatically
  disconnected on log out. The line can be safely removed
  if you are not using LiveView.
  """
  def log_in_user(conn, user, params \\ %{}) do
    token = Accounts.generate_user_session_token(user)
    user_return_to = get_session(conn, :user_return_to)

    conn
    |> renew_session()
    |> put_session(:user_token, token)
    |> put_session(:live_socket_id, "users_sessions:#{Base.url_encode64(token)}")
    |> maybe_write_remember_me_cookie(token, params)
    |> redirect(to: user_return_to || signed_in_path(conn))
  end

  defp maybe_write_remember_me_cookie(conn, token, %{"remember_me" => "on"}) do
    put_resp_cookie(conn, @remember_me_cookie, token, @remember_me_options)
  end

  defp maybe_write_remember_me_cookie(conn, _token, _params) do
    conn
  end

  # This function renews the session ID and erases the whole
  # session to avoid fixation attacks. If there is any data
  # in the session you may want to preserve after log in/log out,
  # you must explicitly fetch the session data before clearing
  # and then immediately set it after clearing, for example:
  #
  #     defp renew_session(conn) do
  #       preferred_locale = get_session(conn, :preferred_locale)
  #
  #       conn
  #       |> configure_session(renew: true)
  #       |> clear_session()
  #       |> put_session(:preferred_locale, preferred_locale)
  #     end
  #
  defp renew_session(conn) do
    conn
    |> configure_session(renew: true)
    |> clear_session()
  end

  @doc """
  Logs the user out.

  It clears all session data for safety. See renew_session.
  """
  def log_out_user(conn) do
    user_token = get_session(conn, :user_token)
    user_token && Accounts.delete_session_token(user_token)

    if live_socket_id = get_session(conn, :live_socket_id) do
      GrasstubeWeb.Endpoint.broadcast(live_socket_id, "disconnect", %{})
    end

    conn
    |> renew_session()
    |> delete_resp_cookie(@remember_me_cookie)
    |> redirect(to: "/")
  end

  @doc """
  Authenticates the user by looking into the session
  and remember me token.
  """
  def fetch_current_user(conn, _opts) do
    {user_token, conn} = ensure_user_token(conn)
    user = user_token && Accounts.get_user_by_session_token(user_token)
    assign(conn, :current_user, user)
  end

  defp ensure_user_token(conn) do
    if user_token = get_session(conn, :user_token) do
      {user_token, conn}
    else
      conn = fetch_cookies(conn, signed: [@remember_me_cookie])

      if user_token = conn.cookies[@remember_me_cookie] do
        {user_token, put_session(conn, :user_token, user_token)}
      else
        {nil, conn}
      end
    end
  end

  @doc """
  Used for routes that require the user to not be authenticated.
  """
  def redirect_if_user_is_authenticated(conn, _opts) do
    if conn.assigns[:current_user] do
      conn
      |> redirect(to: signed_in_path(conn))
      |> halt()
    else
      conn
    end
  end

  @doc """
  Used for routes that require the user to be authenticated.

  If you want to enforce the user username is confirmed before
  they use the application at all, here would be a good place.
  """
  def require_authenticated_user(conn, _opts) do
    if conn.assigns[:current_user] do
      conn
    else
      conn
      |> put_flash(:error, "You must log in to access this page.")
      |> maybe_store_return_to()
      |> redirect(to: Routes.live_path(conn, GrasstubeWeb.SignInLive))
      |> halt()
    end
  end

  defp maybe_store_return_to(%{method: "GET"} = conn) do
    put_session(conn, :user_return_to, current_path(conn))
  end

  defp maybe_store_return_to(conn), do: conn

  defp signed_in_path(_conn), do: "/"

  @ip_headers ["cf-connecting-ip", "x-forwarded-for"]

  def fetch_geo(conn, _opts) do
    geo =
      conn.req_headers
      |> Enum.filter(&(elem(&1, 0) == "cf-ipcountry"))
      |> case do
        [{"cf-ipcountry", cc}] ->
          cc

        _ ->
          conn.req_headers
          |> Enum.filter(&Enum.member?(@ip_headers, elem(&1, 0)))
          |> Enum.reduce_while(nil, fn {_, ip}, _ ->
            ipv4_segments = String.split(ip, ".")

            if length(ipv4_segments) == 4 do
              [ip_a, ip_b, ip_c, ip_d] =
                String.split(ip, ".") |> Enum.map(&elem(Integer.parse(&1), 0))

              case File.read("asn-country-ipv4.csv") do
                {:ok, content} ->
                  content
                  |> String.split("\n")
                  |> Enum.filter(&String.starts_with?(&1, "#{ip_a}."))
                  |> Enum.map(&String.split(&1, ","))
                  |> Enum.filter(fn [ip1, ip2, country] ->
                    [_, ip1_b, ip1_c, ip1_d] =
                      String.split(ip1, ".") |> Enum.map(&elem(Integer.parse(&1), 0))

                    ip_b > ip1_b or
                      (ip_b == ip1_b and ip_c > ip1_c) or
                      (ip_b == ip1_b and ip_c == ip1_c and ip_d >= ip1_d)
                  end)
                  |> Enum.filter(fn [ip1, ip2, country] ->
                    [ip2_a, ip2_b, ip2_c, ip2_d] =
                      String.split(ip2, ".") |> Enum.map(&elem(Integer.parse(&1), 0))

                    ip_a < ip2_a or
                      (ip_a == ip2_a and ip_b < ip2_b) or
                      (ip_a == ip2_a and ip_b == ip2_b and ip_c < ip2_c) or
                      (ip_a == ip2_a and ip_b == ip2_b and ip_c == ip2_c and ip_d <= ip2_d)
                  end)
                  |> case do
                    [[_, _, cc] | _] -> {:halt, cc}
                    _ -> {:cont, nil}
                  end

                _ ->
                  {:cont, nil}
              end
            else
              {:cont, nil}
            end
          end)
      end

    conn = put_session(conn, :geo, geo)

    ua =
      conn.req_headers
      |> Enum.filter(&(elem(&1, 0) == "user-agent"))
      |> case do
        [{"user-agent", ua}] -> ua
        _ -> nil
      end

    conn = put_session(conn, :ua, ua)

    conn
  end
end
