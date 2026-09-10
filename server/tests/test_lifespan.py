import asyncio
import unittest
from unittest.mock import Mock, patch

from server.core.lifespan import app_lifespan


async def _idle_receipt_loop() -> None:
    await asyncio.Event().wait()


class AppLifespanTest(unittest.IsolatedAsyncioTestCase):
    async def test_curl_profile_is_checked_before_startup(self):
        with patch(
            "server.core.lifespan.settings.recipe_html_transport",
            "curl_cffi",
        ), patch(
            "server.core.lifespan.assert_html_browser_profile_supported"
        ) as profile_check, patch(
            "server.core.lifespan.push_receipt_loop",
            side_effect=_idle_receipt_loop,
        ):
            async with app_lifespan(Mock()):
                profile_check.assert_called_once_with()

    async def test_urllib3_rollback_skips_curl_profile_check(self):
        with patch(
            "server.core.lifespan.settings.recipe_html_transport",
            "urllib3",
        ), patch(
            "server.core.lifespan.assert_html_browser_profile_supported"
        ) as profile_check, patch(
            "server.core.lifespan.push_receipt_loop",
            side_effect=_idle_receipt_loop,
        ):
            async with app_lifespan(Mock()):
                profile_check.assert_not_called()

    async def test_profile_failure_blocks_startup(self):
        with patch(
            "server.core.lifespan.settings.recipe_html_transport",
            "curl_cffi",
        ), patch(
            "server.core.lifespan.assert_html_browser_profile_supported",
            side_effect=RuntimeError("chrome150 unavailable"),
        ), patch(
            "server.core.lifespan.push_receipt_loop",
            side_effect=_idle_receipt_loop,
        ) as receipt_loop, self.assertRaises(RuntimeError):
            async with app_lifespan(Mock()):
                pass

        receipt_loop.assert_not_called()
