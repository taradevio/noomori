import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from server.config import settings
from server.core.auth import AuthContext, get_current_user
from server.core.database import rpc_result


logger = logging.getLogger(__name__)
HOUSEHOLD_JOIN_CODE_CONTEXT = b"noomori:household-join-code:v1:"


class CreateHousehold(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class HouseholdJoinCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        code = re.sub(r"[ -]", "", value.strip())
        if not re.fullmatch(r"\d{6}", code):
            raise ValueError("Code must contain exactly six digits")
        return code


class HouseholdActivityRead(BaseModel):
    through_activity_id: int = Field(gt=0)


def household_join_code_digest(code: str) -> str:
    key = settings.household_join_code_hmac_key.get_secret_value().encode("utf-8")
    return hmac.new(
        key,
        HOUSEHOLD_JOIN_CODE_CONTEXT + code.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()


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


def raise_household_rpc_error(result: dict) -> None:
    status = result["status"]
    if status == "FORBIDDEN":
        raise HTTPException(status_code=403, detail="Owner access is required")
    if status == "OWNER_CANNOT_LEAVE":
        raise HTTPException(
            status_code=409,
            detail="Household owners cannot leave their household",
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


def get_household_settings(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "get_household_settings")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


def get_household_activity(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "get_household_activity")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return {key: value for key, value in result.items() if key != "status"}


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


def leave_household(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "leave_household")
    if result["status"] != "LEFT":
        raise_household_rpc_error(result)
    return Response(status_code=204)


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


def revoke_household_join_code(auth: AuthContext = Depends(get_current_user)):
    result = execute_household_rpc(auth, "revoke_household_join_code")
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    return Response(status_code=204)


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

