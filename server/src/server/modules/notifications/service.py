import logging
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import BackgroundTasks, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from server.config import settings
from server.core.auth import AuthContext, get_current_user
from server.core.database import get_admin_supabase
from server.modules.households.service import execute_household_rpc
from server.push_notifications import send_household_recipe_notification


logger = logging.getLogger(__name__)
EXPO_PUSH_TOKEN_PATTERN = re.compile(
    r"^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$"
)


class NotificationDeviceRegistration(BaseModel):
    expo_push_token: str = Field(min_length=20, max_length=512)
    platform: Literal["android", "ios"]
    previous_expo_push_token: str | None = Field(
        default=None,
        min_length=20,
        max_length=512,
    )

    # Purpose: Validate current and previous device tokens against Expo's format.
    # Connects to: Notification registration payload parsing before database writes.
    @field_validator("expo_push_token", "previous_expo_push_token")
    @classmethod
    def validate_expo_push_token(cls, value: str | None):
        if value is not None and not EXPO_PUSH_TOKEN_PATTERN.fullmatch(value):
            raise ValueError("Invalid Expo push token")
        return value


class NotificationDeviceRemoval(BaseModel):
    expo_push_token: str = Field(min_length=20, max_length=512)

    # Purpose: Reject malformed Expo tokens in device-removal requests.
    # Connects to: Notification unregistration before admin-table deletion.
    @field_validator("expo_push_token")
    @classmethod
    def validate_expo_push_token(cls, value: str):
        if not EXPO_PUSH_TOKEN_PATTERN.fullmatch(value):
            raise ValueError("Invalid Expo push token")
        return value


# Purpose: Best-effort delivery of one household recipe activity notification.
# Connects to: FastAPI background tasks, admin Supabase access, and Expo transport.
def deliver_household_recipe_notification(
    household_id: str,
    actor_user_id: str,
    actor_display_name: str,
    action: Literal["added", "edited", "unshared"],
    recipe_id: str,
    recipe_title: str,
) -> None:
    # NOTE: Push is best-effort and must never roll back recipe or activity writes.
    if not settings.supabase_service_role_key or not settings.expo_access_token:
        logger.warning("Push notification skipped because server secrets are missing")
        return
    try:
        send_household_recipe_notification(
            get_admin_supabase(),
            settings.expo_access_token.get_secret_value(),
            household_id,
            actor_user_id,
            actor_display_name,
            action,
            recipe_id,
            recipe_title,
        )
    except Exception:
        logger.exception(
            "Failed to send household recipe push action=%s recipe_id=%s",
            action,
            recipe_id,
        )


# Purpose: Prepare a household recipe notification without delaying recipe writes.
# Connects to: Recipe sharing/edit flows, household settings RPC, and background tasks.
def queue_household_recipe_notification(
    background_tasks: BackgroundTasks | None,
    auth: AuthContext,
    action: Literal["added", "edited", "unshared"],
    recipe: dict,
) -> None:
    if background_tasks is None:
        return
    try:
        household = execute_household_rpc(auth, "get_household_settings")
        if household["status"] != "OK" or household.get("member_count", 0) < 2:
            return
        actor = next(
            (
                member
                for member in household.get("members", [])
                if member.get("user_id") == auth.user.id
            ),
            None,
        )
        background_tasks.add_task(
            deliver_household_recipe_notification,
            household["household_id"],
            auth.user.id,
            actor.get("display_name") if actor else "A household member",
            action,
            str(recipe["id"]),
            recipe.get("title") or "Untitled recipe",
        )
    except Exception:
        # Recipe persistence and activity history remain authoritative even when
        # optional push delivery cannot be prepared.
        logger.exception(
            "Failed to queue household recipe push action=%s recipe_id=%s",
            action,
            recipe.get("id"),
        )


# Purpose: Bind or refresh an Expo push token for the authenticated user's device.
# Connects to: The device registration route and push_notification_devices table.
def register_notification_device(
    payload: NotificationDeviceRegistration,
    auth: AuthContext = Depends(get_current_user),
):
    # NOTE: Admin access is used only after authenticating and binding ownership.
    admin = get_admin_supabase()
    try:
        existing = (
            admin.table("push_notification_devices")
            .select("user_id")
            .eq("expo_push_token", payload.expo_push_token)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing and existing[0].get("user_id") != auth.user.id:
            raise HTTPException(
                status_code=409,
                detail="This notification device belongs to another account",
            )
        values = {
            "expo_push_token": payload.expo_push_token,
            "user_id": auth.user.id,
            "platform": payload.platform,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if existing:
            (
                admin.table("push_notification_devices")
                .update(values)
                .eq("expo_push_token", payload.expo_push_token)
                .eq("user_id", auth.user.id)
                .execute()
            )
        else:
            admin.table("push_notification_devices").insert(values).execute()

        previous_token = payload.previous_expo_push_token
        if previous_token and previous_token != payload.expo_push_token:
            (
                admin.table("push_notification_devices")
                .delete()
                .eq("expo_push_token", previous_token)
                .eq("user_id", auth.user.id)
                .execute()
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to register notification device user_id=%s", auth.user.id)
        raise HTTPException(
            status_code=500,
            detail="Could not enable notifications",
        ) from exc
    return Response(status_code=204)


# Purpose: Remove an authenticated user's Expo push token registration.
# Connects to: The device removal route and push_notification_devices table.
def unregister_notification_device(
    payload: NotificationDeviceRemoval,
    auth: AuthContext = Depends(get_current_user),
):
    admin = get_admin_supabase()
    try:
        (
            admin.table("push_notification_devices")
            .delete()
            .eq("expo_push_token", payload.expo_push_token)
            .eq("user_id", auth.user.id)
            .execute()
        )
    except Exception as exc:
        logger.exception("Failed to unregister notification device user_id=%s", auth.user.id)
        raise HTTPException(
            status_code=500,
            detail="Could not disable notifications",
        ) from exc
    return Response(status_code=204)
