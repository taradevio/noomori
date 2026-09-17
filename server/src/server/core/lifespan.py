import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from server.config import settings
from server.core.database import get_admin_supabase
from server.modules.households.service import cleanup_recipe_handoff_assets
from server.push_notifications import check_push_receipts
from server.recipe_url_import import assert_html_browser_profile_supported


logger = logging.getLogger(__name__)


# Purpose: Periodically request delivery receipts for previously sent push messages.
# Connects to: Called by server/src/server/core/lifespan.py::app_lifespan(); calls server/src/server/core/database.py::get_admin_supabase() and server/src/server/push_notifications.py::check_push_receipts().
async def push_receipt_loop() -> None:
    while True:
        await asyncio.sleep(15 * 60)
        if not settings.supabase_service_role_key or not settings.expo_access_token:
            continue
        try:
            await asyncio.to_thread(
                check_push_receipts,
                get_admin_supabase(),
                settings.expo_access_token.get_secret_value(),
            )
        except Exception:
            logger.exception("Failed to check Expo push receipts")


async def recipe_handoff_cleanup_loop() -> None:
    while True:
        await asyncio.sleep(60)
        if not settings.supabase_service_role_key:
            continue
        try:
            await asyncio.to_thread(cleanup_recipe_handoff_assets)
        except Exception:
            logger.exception("Failed to clean up recipe handoff images")


# Purpose: Start and cleanly cancel application-wide background tasks.
# Connects to: Registered by server/src/server/main.py::create_app() as FastAPI's lifespan callback; starts server/src/server/core/lifespan.py::push_receipt_loop().
@asynccontextmanager
async def app_lifespan(_app: FastAPI):
    if settings.recipe_html_transport == "curl_cffi":
        # This only verifies a capability compiled into the local curl-cffi
        # wheel. It does not resolve a hostname or perform a request.
        assert_html_browser_profile_supported()
    receipt_task = asyncio.create_task(push_receipt_loop())
    handoff_cleanup_task = asyncio.create_task(recipe_handoff_cleanup_loop())
    try:
        yield
    finally:
        receipt_task.cancel()
        handoff_cleanup_task.cancel()
        for task in (receipt_task, handoff_cleanup_task):
            with suppress(asyncio.CancelledError):
                await task
