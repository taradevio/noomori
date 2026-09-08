from fastapi import HTTPException
from supabase import Client, ClientOptions, create_client

from server.config import settings


# Purpose: Create a Supabase client, optionally carrying a user's access token.
# Connects to: Authentication and feature services that rely on Supabase RLS.
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
# Connects to: Background notification work that must bypass user-scoped RLS.
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
# Connects to: Cookbook and household service wrappers around Supabase RPCs.
def rpc_result(response: object) -> dict:
    data = getattr(response, "data", None)
    if not isinstance(data, dict) or not isinstance(data.get("status"), str):
        raise RuntimeError("RPC returned an invalid response")
    return data
