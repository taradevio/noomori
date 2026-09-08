import json
import logging
from datetime import datetime, timedelta, timezone
from time import sleep
from typing import Literal

import urllib3
from supabase import Client


logger = logging.getLogger(__name__)
PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"
PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
PUSH_CHANNEL_ID = "household-recipe-activity"
PUSH_BATCH_SIZE = 100
RECEIPT_BATCH_SIZE = 1_000
_http = urllib3.PoolManager()


# NOTE: Expo HTTP is used directly to avoid a separate push SDK or queue service.
# Purpose: POST JSON to Expo with bounded retries for transient transport failures.
# Connects to: Called by server/src/server/push_notifications.py::{send_household_recipe_notification(),check_push_receipts()}; calls urllib3.PoolManager.request() for Expo send and receipt APIs.
def _post_json(url: str, payload: object, access_token: str) -> dict:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = json.dumps(payload).encode("utf-8")
    last_error: Exception | None = None

    for attempt in range(3):
        try:
            response = _http.request(
                "POST",
                url,
                body=body,
                headers=headers,
                timeout=urllib3.Timeout(connect=5, read=10),
            )
            if 200 <= response.status < 300:
                return json.loads(response.data.decode("utf-8"))
            if response.status != 429 and response.status < 500:
                raise RuntimeError(f"Expo push request failed ({response.status})")
            last_error = RuntimeError(f"Expo push request failed ({response.status})")
        except (urllib3.exceptions.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc

        if attempt < 2:
            sleep(2**attempt)

    raise RuntimeError("Expo push request failed after retries") from last_error


# Purpose: Delete device registrations for tokens Expo reports as stale.
# Connects to: Called by server/src/server/push_notifications.py::{send_household_recipe_notification(),check_push_receipts()}; deletes rows from Supabase push_notification_devices.
def _delete_tokens(admin: Client, tokens: list[str]) -> None:
    if tokens:
        (
            admin.table("push_notification_devices")
            .delete()
            .in_("expo_push_token", tokens)
            .execute()
        )


# Purpose: Send recipe activity pushes to every other household member's devices.
# Connects to: Called by server/src/server/modules/notifications/service.py::deliver_household_recipe_notification(); calls server/src/server/push_notifications.py::{_post_json(),_delete_tokens()} while reading household_members/push_notification_devices and writing push_notification_tickets.
def send_household_recipe_notification(
    admin: Client,
    access_token: str,
    household_id: str,
    actor_user_id: str,
    actor_display_name: str,
    action: Literal["added", "edited", "unshared"],
    recipe_id: str,
    recipe_title: str,
) -> None:
    member_rows = (
        admin.table("household_members")
        .select("user_id")
        .eq("household_id", household_id)
        .neq("user_id", actor_user_id)
        .execute()
        .data
        or []
    )
    user_ids = [row["user_id"] for row in member_rows]
    if not user_ids:
        return

    device_rows = (
        admin.table("push_notification_devices")
        .select("expo_push_token")
        .in_("user_id", user_ids)
        .execute()
        .data
        or []
    )
    tokens = [row["expo_push_token"] for row in device_rows]
    if not tokens:
        return

    actor = actor_display_name.strip()[:80] or "A household member"
    title = recipe_title.strip()[:160] or "Untitled recipe"
    message = {
        "title": "Noomori",
        "body": f"{actor} {action} \u201c{title}\u201d",
        "channelId": PUSH_CHANNEL_ID,
        "data": {
            "kind": "household_recipe_activity",
            "action": action,
            "recipe_id": recipe_id,
        },
    }

    for start in range(0, len(tokens), PUSH_BATCH_SIZE):
        batch_tokens = tokens[start : start + PUSH_BATCH_SIZE]
        result = _post_json(
            PUSH_SEND_URL,
            [{**message, "to": token} for token in batch_tokens],
            access_token,
        )
        tickets = result.get("data") if isinstance(result, dict) else None
        if not isinstance(tickets, list):
            logger.warning("Expo push response did not contain tickets")
            continue

        stale_tokens: list[str] = []
        receipt_rows: list[dict[str, str]] = []
        for token, ticket in zip(batch_tokens, tickets, strict=False):
            if not isinstance(ticket, dict):
                continue
            details = ticket.get("details")
            error = details.get("error") if isinstance(details, dict) else None
            if error == "DeviceNotRegistered":
                stale_tokens.append(token)
            elif ticket.get("status") == "ok" and isinstance(ticket.get("id"), str):
                receipt_rows.append(
                    {"receipt_id": ticket["id"], "expo_push_token": token}
                )
            elif ticket.get("status") == "error":
                logger.warning("Expo rejected push: %s", ticket.get("message"))

        _delete_tokens(admin, stale_tokens)
        if receipt_rows:
            admin.table("push_notification_tickets").upsert(receipt_rows).execute()


# Purpose: Resolve pending Expo tickets and clean up completed or expired records.
# Connects to: Called by server/src/server/core/lifespan.py::push_receipt_loop(); calls server/src/server/push_notifications.py::{_post_json(),_delete_tokens()} while reading/deleting Supabase push_notification_tickets.
def check_push_receipts(
    admin: Client,
    access_token: str,
    now: datetime | None = None,
) -> None:
    # NOTE: Missing receipts remain pending until their 24-hour expiry window.
    current_time = now or datetime.now(timezone.utc)
    rows = (
        admin.table("push_notification_tickets")
        .select("receipt_id,expo_push_token,created_at")
        .lte("created_at", (current_time - timedelta(minutes=15)).isoformat())
        .order("created_at")
        .limit(RECEIPT_BATCH_SIZE)
        .execute()
        .data
        or []
    )
    if not rows:
        return

    result = _post_json(
        PUSH_RECEIPTS_URL,
        {"ids": [row["receipt_id"] for row in rows]},
        access_token,
    )
    receipts = result.get("data") if isinstance(result, dict) else None
    if not isinstance(receipts, dict):
        logger.warning("Expo receipt response did not contain receipts")
        return

    stale_tokens: list[str] = []
    completed_receipts: list[str] = []
    expiry = current_time - timedelta(hours=24)
    for row in rows:
        receipt = receipts.get(row["receipt_id"])
        if isinstance(receipt, dict):
            completed_receipts.append(row["receipt_id"])
            details = receipt.get("details")
            error = details.get("error") if isinstance(details, dict) else None
            if error == "DeviceNotRegistered":
                stale_tokens.append(row["expo_push_token"])
            elif receipt.get("status") == "error":
                logger.warning("Expo push receipt failed: %s", receipt.get("message"))
        elif datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")) <= expiry:
            completed_receipts.append(row["receipt_id"])

    _delete_tokens(admin, stale_tokens)
    if completed_receipts:
        (
            admin.table("push_notification_tickets")
            .delete()
            .in_("receipt_id", completed_receipts)
            .execute()
        )
