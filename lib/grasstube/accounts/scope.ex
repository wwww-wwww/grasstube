defmodule Grasstube.Accounts.Scope do
  @moduledoc """
  Defines the scope of the caller to be used throughout the app.

  The `Grasstube.Accounts.Scope` allows public interfaces to receive
  information about the caller, such as if the call is initiated from an
  end-user, and if so, which user. Additionally, such a scope can carry fields
  such as "super user" or other privileges for use as authorization, or to
  ensure specific code paths can only be access for a given scope.

  It is useful for logging as well as for scoping pubsub subscriptions and
  broadcasts when a caller subscribes to an interface or performs a particular
  action.

  Feel free to extend the fields on this struct to fit the needs of
  growing application requirements.
  """

  alias Grasstube.{User, Guest}

  defstruct id: nil, user: nil, guest: nil, country_code: nil

  @doc """
  Creates a scope for the given user.

  Returns nil if no user is given.
  """
  def for_user(%User{} = user) do
    %__MODULE__{user: user, id: "user:#{user.id}"}
  end

  def for_user(nil) do
    id = Grasstube.Counter.inc()
    %__MODULE__{guest: id, id: "guest:#{id}"}
  end
end

defmodule Grasstube.Counter do
  use Agent

  def start_link(_) do
    Agent.start_link(fn -> 0 end, name: __MODULE__)
  end

  def inc do
    Agent.get_and_update(__MODULE__, &{&1, &1 + 1})
  end
end
