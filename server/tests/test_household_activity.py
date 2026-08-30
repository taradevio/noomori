import os
import unittest

from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault(
    "HOUSEHOLD_JOIN_CODE_HMAC_KEY",
    "0123456789abcdef0123456789abcdef",
)

from server.main import (  # noqa: E402
    HouseholdActivityRead,
    get_household_activity,
    mark_household_activity_read,
)


class FakeRpcCall:
    def __init__(self, outcome):
        self.outcome = outcome

    def execute(self):
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


class HouseholdActivityEndpointTest(unittest.TestCase):
    def test_activity_returns_payload_without_internal_status(self):
        result = {
            "status": "OK",
            "member_count": 2,
            "unread_count": 1,
            "latest_activity_id": 8,
            "activities": [
                {
                    "id": 8,
                    "actor_display_name": "Nanda",
                    "action": "edited",
                    "recipe_id": "33333333-3333-4333-8333-333333333333",
                    "recipe_title": "Noodles",
                    "created_at": "2026-08-29T10:00:00Z",
                }
            ],
        }
        context = auth(result)

        response = get_household_activity(context)

        self.assertNotIn("status", response)
        self.assertEqual(1, response["unread_count"])
        self.assertEqual([("get_household_activity", {})], context.supabase.calls)

    def test_read_marker_is_positive_and_forwarded_to_rpc(self):
        with self.assertRaises(ValidationError):
            HouseholdActivityRead(through_activity_id=0)

        context = auth({"status": "OK"})
        response = mark_household_activity_read(
            HouseholdActivityRead(through_activity_id=8),
            context,
        )

        self.assertEqual(204, response.status_code)
        self.assertEqual(
            [("mark_household_activity_read", {"p_through_activity_id": 8})],
            context.supabase.calls,
        )

    def test_read_marker_must_be_visible_to_the_member(self):
        with self.assertRaises(HTTPException) as raised:
            mark_household_activity_read(
                HouseholdActivityRead(through_activity_id=8),
                auth({"status": "INVALID_ACTIVITY"}),
            )

        self.assertEqual(400, raised.exception.status_code)
        self.assertEqual("Activity marker is invalid", raised.exception.detail)

    def test_activity_requires_a_household(self):
        with self.assertRaises(HTTPException) as raised:
            get_household_activity(auth({"status": "NO_HOUSEHOLD"}))

        self.assertEqual(404, raised.exception.status_code)


if __name__ == "__main__":
    unittest.main()
