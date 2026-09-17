import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from server.config import settings
from server.core.auth import AuthContext, get_current_user
from server.core.database import get_admin_supabase, rpc_result
from server.modules.recipes.images import RECIPE_IMAGE_BUCKET


logger = logging.getLogger(__name__)
HOUSEHOLD_JOIN_CODE_CONTEXT = b"noomori:household-join-code:v1:"


class CreateHousehold(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class HouseholdJoinCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)

    # Purpose: Normalize human-entered invite codes and require exactly six digits.
    # Connects to: Called by Pydantic before server/src/server/modules/households/service.py::{preview_household_join_code(),join_household_with_code()}; has no downstream local function calls.
    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        code = re.sub(r"[ -]", "", value.strip())
        if not re.fullmatch(r"\d{6}", code):
            raise ValueError("Code must contain exactly six digits")
        return code


class HouseholdActivityRead(BaseModel):
    through_activity_id: int = Field(gt=0)


class ResolveRecipeHandoff(BaseModel):
    decision: Literal["keep", "remove"]
    item_ids: list[UUID] | None = Field(default=None, min_length=1)


# Purpose: Create a keyed, context-bound digest for a household join code.
# Connects to: Called by server/src/server/modules/households/service.py::{replace_household_join_code(),preview_household_join_code(),join_household_with_code()}; reads settings.household_join_code_hmac_key and has no downstream local function calls.
def household_join_code_digest(code: str) -> str:
    key = settings.household_join_code_hmac_key.get_secret_value().encode("utf-8")
    return hmac.new(
        key,
        HOUSEHOLD_JOIN_CODE_CONTEXT + code.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


# Purpose: Extract a PostgreSQL-style error code from Supabase exceptions.
# Connects to: Called by server/src/server/modules/households/service.py::{execute_household_rpc(),replace_household_join_code()}; inspects exceptions from Supabase rpc().execute().
def database_error_code(exc: Exception) -> str | None:
    code = getattr(exc, "code", None)
    if isinstance(code, str):
        return code
    details = getattr(exc, "json", None)
    if callable(details):
        value = details()
        if isinstance(value, dict) and isinstance(value.get("code"), str):
            return value["code"]
    return None


# Purpose: Translate household RPC status values into stable HTTP errors.
# Connects to: Called by server/src/server/modules/households/service.py::{get_household_settings(),get_household_activity(),mark_household_activity_read(),leave_household(),replace_household_join_code(),revoke_household_join_code(),preview_household_join_code(),join_household_with_code()} and server/src/server/modules/recipes/service.py::set_recipe_shared(); has no downstream local function calls.
def raise_household_rpc_error(result: dict) -> None:
    status = result["status"]
    if status == "FORBIDDEN":
        raise HTTPException(status_code=403, detail="Owner access is required")
    if status == "OWNER_CANNOT_LEAVE":
        raise HTTPException(
            status_code=409,
            detail="Household owners cannot leave their household",
        )
    if status == "HOUSEHOLD_HAS_MEMBERS":
        raise HTTPException(
            status_code=409,
            detail="Your household must have only you before you can join another",
        )
    if status == "NO_HOUSEHOLD":
        raise HTTPException(status_code=404, detail="Household not found")
    if status == "HOUSEHOLD_NOT_READY":
        raise HTTPException(
            status_code=409,
            detail="Add another household member before sharing recipes",
        )
    if status == "RECIPE_NOT_FOUND":
        raise HTTPException(status_code=404, detail="Recipe not found")
    if status == "INVALID_ACTIVITY":
        raise HTTPException(status_code=400, detail="Activity marker is invalid")
    if status in {"HANDOFF_NOT_FOUND", "ITEM_NOT_FOUND"}:
        raise HTTPException(status_code=404, detail="Recipe handoff not found")
    if status == "DECISION_CONFLICT":
        raise HTTPException(status_code=409, detail="Recipe handoff decision is final")
    if status in {"INVALID_DECISION", "INVALID_ITEMS"}:
        raise HTTPException(status_code=400, detail="Recipe handoff request is invalid")
    if status in {"ASSETS_NOT_READY", "MEMBERSHIP_CHANGED"}:
        raise HTTPException(status_code=409, detail="Recipe handoff is not ready")
    if status == "ALREADY_MEMBER":
        raise HTTPException(
            status_code=409,
            detail="You already belong to a household",
        )
    if status == "INVALID_OR_EXPIRED":
        raise HTTPException(
            status_code=400,
            detail="This invite code is invalid or has expired",
        )
    if status == "RATE_LIMITED":
        retry_after = max(1, int(result.get("retry_after_seconds", 600)))
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again later",
            headers={"Retry-After": str(retry_after)},
        )
    raise RuntimeError(f"Unexpected household RPC status: {status}")


# Purpose: Execute an authenticated household RPC with shared failure handling.
# Connects to: Called by server/src/server/modules/households/service.py::{get_household_settings(),get_household_activity(),mark_household_activity_read(),leave_household(),revoke_household_join_code(),preview_household_join_code(),join_household_with_code()}, server/src/server/modules/notifications/service.py::queue_household_recipe_notification(), and server/src/server/modules/recipes/service.py::set_recipe_shared(); calls server/src/server/modules/households/service.py::database_error_code() and server/src/server/core/database.py::rpc_result().
def execute_household_rpc(
    auth: AuthContext,
    name: str,
    params: dict | None = None,
) -> dict:
    try:
        response = auth.supabase.rpc(name, params or {}).execute()
        return rpc_result(response)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Household RPC failed operation=%s user_id=%s",
            name,
            auth.user.id,
        )
        if database_error_code(exc) == "23505":
            raise HTTPException(
                status_code=409,
                detail="Household membership conflict",
            ) from exc
        raise HTTPException(
            status_code=500,
            detail="Could not complete the household request",
        ) from exc


# Purpose: Return household settings visible to the authenticated member.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for GET /household; calls server/src/server/modules/households/service.py::{execute_household_rpc(),raise_household_rpc_error()}.
def get_household_settings(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "get_household_settings")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


# Purpose: Return the current member's household activity feed and unread state.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for GET /household/activity; calls server/src/server/modules/households/service.py::{execute_household_rpc(),raise_household_rpc_error()}.
def get_household_activity(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "get_household_activity")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


# Purpose: Mark household activity through a supplied record as read.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for PUT /household/activity/read; calls server/src/server/modules/households/service.py::{execute_household_rpc(),raise_household_rpc_error()}.
def mark_household_activity_read(
    payload: HouseholdActivityRead,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_household_rpc(
        auth,
        "mark_household_activity_read",
        {"p_through_activity_id": payload.through_activity_id},
    )
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return Response(status_code=204)


# Purpose: Leave the active household, restoring a parked owned household when present.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for DELETE /household; calls server/src/server/modules/households/service.py::{execute_household_rpc(),raise_household_rpc_error()}.
def leave_household(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "leave_household")
    if result["status"] == "HANDOFF_PREPARED":
        try:
            admin = get_admin_supabase()
            bucket = admin.storage.from_(RECIPE_IMAGE_BUCKET)
            for task in result.get("copy_tasks", []):
                source_path = task.get("source_path")
                destination_path = task.get("destination_path")
                if not source_path or not destination_path:
                    continue
                try:
                    bucket.copy(source_path, destination_path)
                except Exception as copy_error:
                    try:
                        bucket.info(destination_path)
                    except Exception:
                        raise copy_error

            result = rpc_result(
                admin.rpc(
                    "finalize_recipe_handoff",
                    {
                        "p_user_id": auth.user.id,
                        "p_handoff_id": result["handoff_id"],
                    },
                ).execute()
            )
        except Exception as exc:
            logger.exception(
                "Could not isolate recipe handoff assets user_id=%s",
                auth.user.id,
            )
            raise HTTPException(
                status_code=500,
                detail="Could not leave the household",
            ) from exc
    if result["status"] not in {"LEFT", "RESTORED"}:
        raise_household_rpc_error(result)
    return {
        "status": result["status"],
        "household": result.get("household"),
    }


def get_recipe_handoffs(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "get_recipe_handoffs")
    if result["status"] != "OK":
        raise_household_rpc_error(result)

    handoffs = result.get("handoffs") or []
    paths = [
        item["image_path"]
        for handoff in handoffs
        for item in handoff.get("items", [])
        if item.get("image_path")
    ]
    urls_by_path: dict[str, str] = {}
    if paths:
        try:
            signed = (
                get_admin_supabase()
                .storage.from_(RECIPE_IMAGE_BUCKET)
                .create_signed_urls(list(dict.fromkeys(paths)), 3600)
            )
            for image in signed:
                path = image.get("path")
                url = image.get("signedURL") or image.get("signedUrl")
                if path and url and not image.get("error"):
                    urls_by_path[path] = url
        except Exception:
            logger.exception("Could not sign recipe handoff images")

    for handoff in handoffs:
        for item in handoff.get("items", []):
            item["image_url"] = urls_by_path.get(item.get("image_path"))
    return handoffs


def _delete_handoff_cleanup_paths(admin, rows: list[dict]) -> None:
    bucket = admin.storage.from_(RECIPE_IMAGE_BUCKET)
    for row in rows:
        path = row.get("asset_cleanup_path")
        if not path:
            continue
        try:
            bucket.remove([path])
            (
                admin.table("recipe_handoff_items")
                .update({"asset_cleanup_path": None})
                .eq("id", row["id"])
                .eq("asset_cleanup_path", path)
                .execute()
            )
        except Exception:
            logger.exception("Could not clean up recipe handoff image path=%s", path)


def cleanup_recipe_handoff_assets() -> None:
    admin = get_admin_supabase()
    rows = (
        admin.table("recipe_handoff_items")
        .select("id,asset_cleanup_path")
        .not_.is_("asset_cleanup_path", "null")
        .limit(100)
        .execute()
        .data
        or []
    )
    _delete_handoff_cleanup_paths(admin, rows)


def resolve_recipe_handoff(
    handoff_id: UUID,
    payload: ResolveRecipeHandoff,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_household_rpc(
        auth,
        "resolve_recipe_handoff",
        {
            "p_handoff_id": str(handoff_id),
            "p_decision": payload.decision,
            "p_item_ids": (
                [str(item_id) for item_id in payload.item_ids]
                if payload.item_ids is not None
                else None
            ),
        },
    )
    if result["status"] != "OK":
        raise_household_rpc_error(result)

    cleanup_paths = result.pop("cleanup_paths", [])
    if cleanup_paths:
        try:
            admin = get_admin_supabase()
            rows = (
                admin.table("recipe_handoff_items")
                .select("id,asset_cleanup_path")
                .in_("asset_cleanup_path", cleanup_paths)
                .execute()
                .data
                or []
            )
            _delete_handoff_cleanup_paths(admin, rows)
        except Exception:
            logger.exception("Could not immediately clean up recipe handoff images")
    return {key: value for key, value in result.items() if key != "status"}


# Purpose: Generate and store a new unique household invite code for an owner.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for POST /household/invite; calls server/src/server/modules/households/service.py::{household_join_code_digest(),database_error_code(),raise_household_rpc_error()} and server/src/server/core/database.py::rpc_result().
def replace_household_join_code(auth: AuthContext = Depends(get_current_user)):
    for _attempt in range(5):
        code = f"{secrets.randbelow(1_000_000):06d}"
        digest = household_join_code_digest(code)
        try:
            response = (
                auth.supabase
                .rpc(
                    "replace_household_join_code",
                    {"p_code_digest": digest},
                )
                .execute()
            )
            result = rpc_result(response)
        except Exception as exc:
            if database_error_code(exc) == "23505":
                continue
            logger.exception(
                "Could not replace household join code user_id=%s",
                auth.user.id,
            )
            raise HTTPException(
                status_code=500,
                detail="Could not generate a join code",
            ) from exc

        if result["status"] != "OK":
            raise_household_rpc_error(result)
        return {"code": code, "expires_at": result["expires_at"]}

    raise HTTPException(
        status_code=503,
        detail="Could not generate a unique join code",
    )


# Purpose: Invalidate the household owner's currently active invite code.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for DELETE /household/invite; calls server/src/server/modules/households/service.py::{execute_household_rpc(),raise_household_rpc_error()}.
def revoke_household_join_code(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "revoke_household_join_code")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return Response(status_code=204)


# Purpose: Preview the household associated with an invite code without joining it.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for POST /household/join/preview; calls server/src/server/modules/households/service.py::{household_join_code_digest(),execute_household_rpc(),raise_household_rpc_error()}.
def preview_household_join_code(
    payload: HouseholdJoinCodeRequest,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_household_rpc(
        auth,
        "preview_household_join_code",
        {"p_code_digest": household_join_code_digest(payload.code)},
    )
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


# Purpose: Join the authenticated user to the household identified by an invite code.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for POST /household/join; calls server/src/server/modules/households/service.py::{household_join_code_digest(),execute_household_rpc(),raise_household_rpc_error()}.
def join_household_with_code(
    payload: HouseholdJoinCodeRequest,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_household_rpc(
        auth,
        "join_household_with_code",
        {"p_code_digest": household_join_code_digest(payload.code)},
    )
    if result["status"] not in {"JOINED", "ALREADY_MEMBER"}:
        raise_household_rpc_error(result)
    return result


# Purpose: Create a household, its owner membership, and completed onboarding state.
# Connects to: Registered by server/src/server/modules/households/router.py::router.add_api_route() for POST /household; writes Supabase households, household_members, and profiles and has no downstream local function calls.
def create_household(payload: CreateHousehold, auth: AuthContext = Depends(get_current_user)):
    supabase = auth.supabase
    user_id = auth.user.id
    try:
        logger.info(
            "Creating household for user_id=%s",
            user_id,
        )
        # supabase-py returns the inserted row by default. The row must therefore
        # satisfy both the households INSERT policy and its SELECT policy.
        household_response = (
            supabase
            .table("households")
            .insert({
                "name": payload.name,
                "created_by": user_id,
            })
            .execute()
        )

        household = household_response.data[0]
        household_id = household["id"]

        logger.info(
            "Household created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        # The bootstrap policy must allow the creator to add their own initial
        # owner membership. Returning it also requires a matching SELECT policy.
        member_response = (
            supabase
            .table("household_members")
            .insert({
                "household_id": household_id,
                "user_id": user_id,
                "role": "owner",
            })
            .execute()
        )

        logger.info(
            "Owner membership created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        date_now = datetime.now(timezone.utc).isoformat()

        # Scope the update to the authenticated user's profile; the profiles
        # SELECT and UPDATE policies must permit the same user-owned row.
        onboarding_response = (
            supabase
            .table("profiles")
            .update({
                "onboarding_completed_at": date_now,
                "updated_at": date_now,
            })
            .eq("id", user_id)
            .execute()
        )

        logger.info(
            "Onboarding completed user_id=%s household_id=%s",
            user_id,
            household_id,
        )

        return {
            "household": household,
            "membership": member_response.data[0],
            "profile": onboarding_response.data[0],
        }

    except Exception as exc:
        logger.exception(
            "Failed to create household user_id=%s",
            user_id,
        )
        raise HTTPException(status_code=500, detail=str(exc),) from exc
