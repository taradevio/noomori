import json
import os
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from server.characterize_recipe_transport import (
    MANIFEST_URL_COUNT,
    _read_manifest,
    run_characterization,
)
from server.config import Settings
from server.recipe_url_import import (
    FetchedRecipePage,
    WebsiteImportError,
)


class CharacterizeRecipeTransportTest(unittest.TestCase):
    def test_manifest_requires_exactly_twenty_valid_import_urls(self):
        secret = "manifest-secret-never-print"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "urls.txt"
            path.write_text(
                "\n".join(
                    f"https://example.com/{index}?token={secret}"
                    for index in range(MANIFEST_URL_COUNT)
                ),
                encoding="utf-8",
            )
            self.assertEqual(MANIFEST_URL_COUNT, len(_read_manifest(path)))

            path.write_text(
                f"https://example.com/?token={secret}\nnot-a-url\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError) as caught:
                _read_manifest(path)

        self.assertNotIn(secret, str(caught.exception))

    def test_outputs_only_sanitized_transport_results_in_baseline_first_order(self):
        secret = "query-secret-never-print"
        body_secret = "body-secret-never-print"
        urls = [
            f"https://example.com/recipe/{index}?token={secret}"
            for index in range(MANIFEST_URL_COUNT)
        ]
        output = StringIO()

        def fetch(url, *, transport):
            self.assertIn(secret, url)
            if transport == "urllib3":
                return FetchedRecipePage(
                    html=body_secret,
                    url=url,
                    hostname="example.com",
                    response_size=123,
                    transport=transport,
                    request_round_count=1,
                    address_attempt_count=1,
                )
            raise WebsiteImportError(
                "page_unavailable",
                hostname="example.com",
                upstream_status=503,
                response_size=456,
                transport=transport,
                browser_profile="chrome150",
                request_round_count=2,
                address_attempt_count=2,
                retry_reason="http_503",
            )

        with patch(
            "server.characterize_recipe_transport."
            "assert_html_browser_profile_supported"
        ) as profile_check, patch(
            "server.characterize_recipe_transport.fetch_public_html",
            side_effect=fetch,
        ) as fetch_mock:
            exit_code = run_characterization(urls, output)

        self.assertEqual(0, exit_code)
        profile_check.assert_called_once_with()
        self.assertEqual(MANIFEST_URL_COUNT * 2, fetch_mock.call_count)

        records = [json.loads(line) for line in output.getvalue().splitlines()]
        expected_fields = {
            "hostname",
            "transport",
            "result",
            "upstream_status",
            "duration_ms",
            "response_size",
            "request_round_count",
            "address_attempt_count",
            "retry_reason",
        }
        self.assertEqual(MANIFEST_URL_COUNT * 2, len(records))
        self.assertTrue(all(set(record) == expected_fields for record in records))
        self.assertTrue(
            all(
                record["transport"] == "urllib3"
                for record in records[:MANIFEST_URL_COUNT]
            )
        )
        self.assertTrue(
            all(
                record["transport"] == "curl_cffi"
                for record in records[MANIFEST_URL_COUNT:]
            )
        )

        rendered = output.getvalue()
        self.assertNotIn(secret, rendered)
        self.assertNotIn(body_secret, rendered)
        self.assertNotIn("/recipe/", rendered)

    def test_profile_failure_aborts_before_any_request(self):
        urls = ["https://example.com/recipe"] * MANIFEST_URL_COUNT
        output = StringIO()

        with patch(
            "server.characterize_recipe_transport."
            "assert_html_browser_profile_supported",
            side_effect=RuntimeError("chrome150 unavailable"),
        ), patch(
            "server.characterize_recipe_transport.fetch_public_html"
        ) as fetch_mock, self.assertRaises(RuntimeError):
            run_characterization(urls, output)

        fetch_mock.assert_not_called()
        self.assertEqual("", output.getvalue())

    def test_unexpected_exception_does_not_expose_exception_or_url(self):
        secret = "unexpected-secret"
        urls = [
            f"https://example.com/recipe?token={secret}"
        ] * MANIFEST_URL_COUNT
        output = StringIO()

        with patch(
            "server.characterize_recipe_transport."
            "assert_html_browser_profile_supported"
        ), patch(
            "server.characterize_recipe_transport.fetch_public_html",
            side_effect=RuntimeError(f"failed while reading {secret}"),
        ):
            exit_code = run_characterization(urls, output)

        self.assertEqual(1, exit_code)
        self.assertNotIn(secret, output.getvalue())
        records = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertTrue(
            all(record["result"] == "unexpected_error" for record in records)
        )


class RecipeHtmlTransportConfigTest(unittest.TestCase):
    def test_curl_is_default_and_environment_can_select_urllib3_rollback(self):
        required_environment = {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_KEY": "publishable-key",
            "HOUSEHOLD_JOIN_CODE_HMAC_KEY": "a" * 32,
        }

        with patch.dict(os.environ, required_environment, clear=True):
            configured = Settings(_env_file=None)
        self.assertEqual("curl_cffi", configured.recipe_html_transport)

        with patch.dict(
            os.environ,
            {
                **required_environment,
                "RECIPE_HTML_TRANSPORT": "urllib3",
            },
            clear=True,
        ):
            configured = Settings(_env_file=None)
        self.assertEqual("urllib3", configured.recipe_html_transport)
