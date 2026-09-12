import logging
from dataclasses import dataclass

import sentry_sdk
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from server.core.database import get_supabase


logger = logging.getLogger(__name__)
security = HTTPBearer()


@dataclass
class AuthContext:
    user: object
    supabase: Client


# Purpose: Authenticate a bearer token and build the request-scoped user context.
# Connects to: Called by FastAPI Depends() in server/src/server/modules/cookbooks/service.py::{list_cookbooks(),create_cookbook(),get_cookbook(),rename_cookbook(),replace_cookbook_recipes(),delete_cookbook()}, server/src/server/modules/households/service.py::{get_household_settings(),get_household_activity(),mark_household_activity_read(),leave_household(),replace_household_join_code(),revoke_household_join_code(),preview_household_join_code(),join_household_with_code(),create_household()}, server/src/server/modules/notifications/service.py::{register_notification_device(),unregister_notification_device()}, server/src/server/modules/recipes/service.py::{import_recipe_text(),list_recipes(),list_household_recipes(),get_recipe(),create_recipe(),update_recipe(),share_recipe(),unshare_recipe(),delete_recipe(),activate_recipe_image(),remove_recipe_image()}, and server/src/server/modules/recipes/imports/website.py::{import_recipe_url(),import_recipe_image()}; calls server/src/server/core/database.py::get_supabase() and Supabase auth.get_user().
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthContext:
    access_token = credentials.credentials
    supabase = get_supabase(access_token)

    try:
        response = supabase.auth.get_user(access_token)
    except Exception as exc:
        logger.warning("Authentication failed", exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid Authentication") from exc

    if not response.user:
        logger.warning("Authentication returned no user")
        raise HTTPException(status_code=401, detail="Invalid Authentication")

    sentry_sdk.set_user({"id": str(response.user.id)})
    supabase.postgrest.auth(access_token)
    return AuthContext(user=response.user, supabase=supabase)
