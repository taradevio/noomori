import hashlib
import hmac
import os
import unittest

from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault(
    "HOUSEHOLD_JOIN_CODE_HMAC_KEY",
    "0123456789abcdef0123456789abcdef",
)

from server.modules.households.service import (  # noqa: E402
    HOUSEHOLD_JOIN_CODE_CONTEXT,
    HouseholdJoinCodeRequest,
    ResolveRecipeHandoff,
    get_recipe_handoffs,
    get_household_settings,
    household_join_code_digest,
    join_household_with_code,
    leave_household,
    preview_household_join_code,
    replace_household_join_code,
    resolve_recipe_handoff,
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


class FakeHandoffBucket:
    def __init__(self):
        self.copies = []

    def copy(self, source, destination):
        self.copies.append((source, destination))

    def create_signed_urls(self, paths, _expires_in):
        return [
            {"path": path, "signedURL": f"https://images.test/{path}"}
            for path in paths
        ]


class FailingHandoffBucket(FakeHandoffBucket):
    def copy(self, source, destination):
        raise RuntimeError("copy failed")

    def info(self, _path):
        raise RuntimeError("destination missing")


class FakeHandoffAdmin:
    def __init__(self, rpc_result):
        self.bucket = FakeHandoffBucket()
        self.rpc_result = rpc_result
        self.rpc_calls = []
        self.storage = SimpleNamespace(from_=lambda _name: self.bucket)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        return FakeRpcCall(self.rpc_result)


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
    @patch("server.modules.households.service.secrets.randbelow", side_effect=[42, 43])
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

    @patch("server.modules.households.service.secrets.randbelow", return_value=42)
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
            "members": [
                {
                    "user_id": "22222222-2222-4222-8222-222222222222",
                    "display_name": "Nanda",
                    "role": "owner",
                }
            ],
            "active_code_expires_at": None,
        }

        response = get_household_settings(auth(result))

        self.assertNotIn("status", response)
        self.assertEqual("Our kitchen", response["household_name"])
        self.assertEqual("Nanda", response["members"][0]["display_name"])

    def test_member_can_leave_household(self):
        context = auth({"status": "LEFT"})

        response = leave_household(context)

        self.assertEqual({"status": "LEFT", "household": None}, response)
        self.assertEqual([("leave_household", {})], context.supabase.calls)

    def test_member_can_restore_a_parked_household(self):
        context = auth(
            {
                "status": "RESTORED",
                "household": {"id": "owned-home", "name": "My kitchen"},
            }
        )

        response = leave_household(context)

        self.assertEqual("RESTORED", response["status"])
        self.assertEqual("My kitchen", response["household"]["name"])

    @patch("server.modules.households.service.get_admin_supabase")
    def test_leave_copies_handoff_images_before_finalizing(self, get_admin):
        admin = FakeHandoffAdmin({"status": "LEFT", "household": None})
        get_admin.return_value = admin
        context = auth(
            {
                "status": "HANDOFF_PREPARED",
                "handoff_id": "handoff-id",
                "recipe_count": 1,
                "copy_tasks": [
                    {
                        "item_id": "item-id",
                        "source_path": "recipes/user/recipe/photo.webp",
                        "destination_path": "recipe-handoffs/handoff-id/item-id.webp",
                    }
                ],
            }
        )

        response = leave_household(context)

        self.assertEqual({"status": "LEFT", "household": None}, response)
        self.assertEqual(
            [
                (
                    "recipes/user/recipe/photo.webp",
                    "recipe-handoffs/handoff-id/item-id.webp",
                )
            ],
            admin.bucket.copies,
        )
        self.assertEqual(
            [
                (
                    "finalize_recipe_handoff",
                    {
                        "p_user_id": "22222222-2222-4222-8222-222222222222",
                        "p_handoff_id": "handoff-id",
                    },
                )
            ],
            admin.rpc_calls,
        )

    @patch("server.modules.households.service.get_admin_supabase")
    def test_copy_failure_never_finalizes_the_handoff(self, get_admin):
        admin = FakeHandoffAdmin({"status": "LEFT", "household": None})
        admin.bucket = FailingHandoffBucket()
        admin.storage = SimpleNamespace(from_=lambda _name: admin.bucket)
        get_admin.return_value = admin
        context = auth(
            {
                "status": "HANDOFF_PREPARED",
                "handoff_id": "handoff-id",
                "recipe_count": 1,
                "copy_tasks": [
                    {
                        "source_path": "recipes/user/recipe/photo.webp",
                        "destination_path": "recipe-handoffs/handoff-id/item-id.webp",
                    }
                ],
            }
        )

        with self.assertRaises(HTTPException) as raised:
            leave_household(context)

        self.assertEqual(500, raised.exception.status_code)
        self.assertEqual([], admin.rpc_calls)

    @patch("server.modules.households.service.get_admin_supabase")
    def test_owner_lists_handoffs_with_signed_images(self, get_admin):
        admin = FakeHandoffAdmin({"status": "unused"})
        get_admin.return_value = admin
        context = auth(
            {
                "status": "OK",
                "handoffs": [
                    {
                        "id": "handoff-id",
                        "items": [
                            {
                                "id": "item-id",
                                "image_path": "recipe-handoffs/handoff-id/item-id.webp",
                            }
                        ],
                    }
                ],
            }
        )

        handoffs = get_recipe_handoffs(context)

        self.assertEqual(
            "https://images.test/recipe-handoffs/handoff-id/item-id.webp",
            handoffs[0]["items"][0]["image_url"],
        )

    def test_owner_resolves_handoff_through_one_rpc(self):
        handoff_id = "33333333-3333-4333-8333-333333333333"
        item_id = "44444444-4444-4444-8444-444444444444"
        context = auth(
            {
                "status": "OK",
                "handoff_id": handoff_id,
                "handoff_status": "resolved",
                "resolved_item_ids": [item_id],
                "kept_recipe_ids": ["kept-id"],
                "cleanup_paths": [],
            }
        )

        response = resolve_recipe_handoff(
            UUID(handoff_id),
            ResolveRecipeHandoff(decision="keep", item_ids=[UUID(item_id)]),
            context,
        )

        self.assertEqual("resolved", response["handoff_status"])
        self.assertEqual(
            (
                "resolve_recipe_handoff",
                {
                    "p_handoff_id": handoff_id,
                    "p_decision": "keep",
                    "p_item_ids": [item_id],
                },
            ),
            context.supabase.calls[0],
        )

    def test_owner_cannot_keep_a_duplicate_personal_recipe(self):
        handoff_id = "33333333-3333-4333-8333-333333333333"
        item_id = "44444444-4444-4444-8444-444444444444"

        with self.assertRaises(HTTPException) as raised:
            resolve_recipe_handoff(
                UUID(handoff_id),
                ResolveRecipeHandoff(decision="keep", item_ids=[UUID(item_id)]),
                auth(DatabaseError("NM001")),
            )

        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual(
            "You already have this recipe.",
            raised.exception.detail,
        )

    def test_owner_cannot_keep_a_duplicate_household_recipe(self):
        handoff_id = "33333333-3333-4333-8333-333333333333"
        item_id = "44444444-4444-4444-8444-444444444444"

        with self.assertRaises(HTTPException) as raised:
            resolve_recipe_handoff(
                UUID(handoff_id),
                ResolveRecipeHandoff(decision="keep", item_ids=[UUID(item_id)]),
                auth(DatabaseError("NM002")),
            )

        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual(
            "This recipe is already shared with this household",
            raised.exception.detail,
        )

    def test_owner_with_members_cannot_switch_households(self):
        request = HouseholdJoinCodeRequest(code="483921")

        with self.assertRaises(HTTPException) as raised:
            preview_household_join_code(
                request,
                auth({"status": "HOUSEHOLD_HAS_MEMBERS"}),
            )

        self.assertEqual(409, raised.exception.status_code)
        self.assertIn("must have only you", raised.exception.detail)

    def test_owner_cannot_leave_household(self):
        with self.assertRaises(HTTPException) as raised:
            leave_household(auth({"status": "OWNER_CANNOT_LEAVE"}))

        self.assertEqual(409, raised.exception.status_code)
        self.assertEqual(
            "Household owners cannot leave their household",
            raised.exception.detail,
        )

    def test_leave_requires_a_household(self):
        with self.assertRaises(HTTPException) as raised:
            leave_household(auth({"status": "NO_HOUSEHOLD"}))

        self.assertEqual(404, raised.exception.status_code)


if __name__ == "__main__":
    unittest.main()
