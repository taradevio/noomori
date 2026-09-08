import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from server.config import settings
from server.core.database import get_admin_supabase
from server.push_notifications import check_push_receipts


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


# Purpose: Start and cleanly cancel application-wide background tasks.
# Connects to: Registered by server/src/server/main.py::create_app() as FastAPI's lifespan callback; starts server/src/server/core/lifespan.py::push_receipt_loop().
async def app_lifespan(_app: FastAPI):
    receipt_task = asyncio.create_task(push_receipt_loop())
    try:
        yield
    finally:
        receipt_task.cancel()
        with suppress(asyncio.CancelledError):
            await receipt_task
