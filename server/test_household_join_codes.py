import hashlib
import hmac
import os
import unittest

from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault(
    "HOUSEHOLD_JOIN_CODE_HMAC_KEY",
    "0123456789abcdef0123456789abcdef",
)

from server.main import (  # noqa: E402
    HOUSEHOLD_JOIN_CODE_CONTEXT,
    HouseholdJoinCodeRequest,
    get_household_settings,
    household_join_code_digest,
    join_household_with_code,
    preview_household_join_code,
    replace_household_join_code,
)
from server.config import settings  # noqa: E402


class DatabaseError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class FakeRpcCall:
    def __init__(self, outcome):
        self.outcome = outcome

    def execute(self):
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return SimpleNamespace(data=self.outcome)


class FakeSupabase:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return FakeRpcCall(self.outcomes.pop(0))


def auth(*outcomes):
    return SimpleNamespace(
        user=SimpleNamespace(id="22222222-2222-4222-8222-222222222222"),
        supabase=FakeSupabase(*outcomes),
    )


class JoinCodeInputTest(unittest.TestCase):
    def test_normalizes_supported_human_formats_and_preserves_zeroes(self):
        for value in ("000042", "000 042", "000-042"):
            with self.subTest(value=value):
                self.assertEqual("000042", HouseholdJoinCodeRequest(code=value).code)

    def test_rejects_non_digits_and_incomplete_codes(self):
        for value in ("12345", "12345a", "12_3456"):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    HouseholdJoinCodeRequest(code=value)

    def test_hmac_uses_the_server_key_and_domain_separator(self):
        key = settings.household_join_code_hmac_key.get_secret_value().encode()
        expected = hmac.new(
            key,
            HOUSEHOLD_JOIN_CODE_CONTEXT + b"483921",
            hashlib.sha256,
        ).hexdigest()

        self.assertEqual(expected, household_join_code_digest("483921"))


class HouseholdEndpointTest(unittest.TestCase):
    @patch("server.main.secrets.randbelow", side_effect=[42, 43])
    def test_generation_retries_a_digest_collision_without_exposing_digest(
        self,
        _randbelow,
    ):
        context = auth(
            DatabaseError("23505"),
            {"status": "OK", "expires_at": "2026-08-28T10:10:00Z"},
        )

        response = replace_household_join_code(context)

        self.assertEqual("000043", response["code"])
        self.assertEqual(2, len(context.supabase.calls))
        self.assertNotEqual(
            response["code"],
            context.supabase.calls[-1][1]["p_code_digest"],
        )

    @patch("server.main.secrets.randbelow", return_value=42)
    def test_generation_stops_after_five_collisions(self, _randbelow):
        context = auth(*(DatabaseError("23505") for _ in range(5)))

        with self.assertRaises(HTTPException) as raised:
            replace_household_join_code(context)

        self.assertEqual(503, raised.exception.status_code)
        self.assertEqual(5, len(context.supabase.calls))

    def test_preview_maps_generic_credentials_and_rate_limit(self):
        request = HouseholdJoinCodeRequest(code="483921")

        with self.assertRaises(HTTPException) as invalid:
            preview_household_join_code(
                request,
                auth({"status": "INVALID_OR_EXPIRED"}),
            )
        self.assertEqual(400, invalid.exception.status_code)

        with self.assertRaises(HTTPException) as throttled:
            preview_household_join_code(
                request,
                auth({"status": "RATE_LIMITED", "retry_after_seconds": 37}),
            )
        self.assertEqual(429, throttled.exception.status_code)
        self.assertEqual("37", throttled.exception.headers["Retry-After"])

    def test_join_returns_membership_first_recovery_as_success(self):
        result = {
            "status": "ALREADY_MEMBER",
            "household": {"id": "household", "name": "Our kitchen"},
            "membership": {"role": "member"},
        }

        self.assertEqual(
            result,
            join_household_with_code(
                HouseholdJoinCodeRequest(code="483921"),
                auth(result),
            ),
        )

    def test_settings_returns_only_the_rpc_payload(self):
        result = {
            "status": "OK",
            "household_id": "household",
            "household_name": "Our kitchen",
            "role": "owner",
            "member_count": 1,
            "active_code_expires_at": None,
        }

        response = get_household_settings(auth(result))

        self.assertNotIn("status", response)
        self.assertEqual("Our kitchen", response["household_name"])


if __name__ == "__main__":
    unittest.main()
