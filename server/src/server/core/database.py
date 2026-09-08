from fastapi import HTTPException
from supabase import Client, ClientOptions, create_client

from server.config import settings


# Purpose: Create a Supabase client, optionally carrying a user's access token.
# Connects to: Called by server/src/server/core/auth.py::get_current_user(); calls supabase.create_client() to supply request-scoped clients to endpoint functions.
def get_supabase(access_token: str | None = None) -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase credentials are missing")

    options = None
    if access_token:
        options = ClientOptions(
            headers={"Authorization": f"Bearer {access_token}"},
        )
    return create_client(settings.supabase_url, settings.supabase_key, options)


# Purpose: Create a privileged Supabase client from the server-only service key.
# Connects to: Called by server/src/server/core/lifespan.py::push_receipt_loop() and server/src/server/modules/notifications/service.py::{deliver_household_recipe_notification(),register_notification_device(),unregister_notification_device()}; calls supabase.create_client().
def get_admin_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=503,
            detail="Supabase admin credentials are missing",
        )
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key.get_secret_value(),
    )


# Purpose: Validate and unwrap the shared status payload returned by an RPC call.
# Connects to: Called by server/src/server/modules/cookbooks/service.py::execute_cookbook_rpc() and server/src/server/modules/households/service.py::{execute_household_rpc(),replace_household_join_code()}; reads the response returned by Supabase rpc().execute().
def rpc_result(response: object) -> dict:
    data = getattr(response, "data", None)
    if not isinstance(data, dict) or not isinstance(data.get("status"), str):
        raise RuntimeError("RPC returned an invalid response")
    return data
