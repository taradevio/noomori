import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import SecretStr

os.environ.setdefault(
    "HOUSEHOLD_JOIN_CODE_HMAC_KEY",
    "0123456789abcdef0123456789abcdef",
)

from server.core.database import get_admin_supabase  # noqa: E402
from server.modules.notifications.service import (  # noqa: E402
    NotificationDeviceRegistration,
    NotificationDeviceRemoval,
    deliver_household_recipe_notification,
    register_notification_device,
    unregister_notification_device,
)
from server.push_notifications import (  # noqa: E402
    PUSH_BATCH_SIZE,
    _post_json,
    check_push_receipts,
    send_household_recipe_notification,
)


class FakeQuery:
    def __init__(self, database, table, operation="select", values=None):
        self.database = database
        self.table = table
        self.operation = operation
        self.values = values
        self.filters = []
        self.members = []

    def select(self, _columns):
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def upsert(self, values, **_kwargs):
        self.operation = "upsert"
        self.values = values
        return self

    def insert(self, values):
        self.operation = "upsert"
        self.values = values
        return self

    def update(self, values):
        self.operation = "upsert"
        self.values = values
        return self

    def eq(self, column, value):
        self.filters.append(("eq", column, value))
        return self

    def neq(self, column, value):
        self.filters.append(("neq", column, value))
        return self

    def in_(self, column, values):
        self.filters.append(("in", column, values))
        return self

    def lte(self, column, value):
        self.filters.append(("lte", column, value))
        return self

    def order(self, _column):
        return self

    def limit(self, _value):
        return self

    def execute(self):
        self.database.calls.append(self)
        if self.operation == "upsert":
            self.database.upserts.setdefault(self.table, []).append(self.values)
            return SimpleNamespace(data=self.values)
        if self.operation == "delete":
            self.database.deletes.append((self.table, self.filters))
            return SimpleNamespace(data=[])

        rows = list(self.database.rows.get(self.table, []))
        for operation, column, value in self.filters:
            if operation == "eq":
                rows = [row for row in rows if row.get(column) == value]
            elif operation == "neq":
                rows = [row for row in rows if row.get(column) != value]
            elif operation == "in":
                rows = [row for row in rows if row.get(column) in value]
            elif operation == "lte":
                rows = [row for row in rows if row.get(column) <= value]
        return SimpleNamespace(data=rows)


class FakeAdmin:
    def __init__(self, rows=None):
        self.rows = rows or {}
        self.calls = []
        self.upserts = {}
        self.deletes = []

    def table(self, name):
        return FakeQuery(self, name)


class PushDeliveryTest(unittest.TestCase):
    def test_sends_silent_notifications_only_to_other_members(self):
        admin = FakeAdmin(
            {
                "household_members": [
                    {"household_id": "home", "user_id": "actor"},
                    {"household_id": "home", "user_id": "member"},
                ],
                "push_notification_devices": [
                    {
                        "user_id": "actor",
                        "expo_push_token": "ExponentPushToken[actor]",
                    },
                    {
                        "user_id": "member",
                        "expo_push_token": "ExponentPushToken[member]",
                    },
                ],
            }
        )
        response = {"data": [{"status": "ok", "id": "receipt-1"}]}
        with patch("server.push_notifications._post_json", return_value=response) as post:
            send_household_recipe_notification(
                admin,
                "expo-secret",
                "home",
                "actor",
                "Nanda",
                "edited",
                "22222222-2222-4222-8222-222222222222",
                "Noodles",
            )

        messages = post.call_args.args[1]
        self.assertEqual("ExponentPushToken[member]", messages[0]["to"])
        self.assertEqual("Noomori", messages[0]["title"])
        self.assertEqual("Nanda edited “Noodles”", messages[0]["body"])
        self.assertEqual("household-recipe-activity", messages[0]["channelId"])
        self.assertEqual(
            {
                "kind": "household_recipe_activity",
                "action": "edited",
                "recipe_id": "22222222-2222-4222-8222-222222222222",
            },
            messages[0]["data"],
        )
        self.assertNotIn("sound", messages[0])
        self.assertNotIn("badge", messages[0])
        self.assertEqual(
            [{"receipt_id": "receipt-1", "expo_push_token": "ExponentPushToken[member]"}],
            admin.upserts["push_notification_tickets"][0],
        )

    def test_batches_at_most_one_hundred_messages(self):
        devices = [
            {
                "user_id": "member",
                "expo_push_token": f"ExponentPushToken[member-{index}]",
            }
            for index in range(PUSH_BATCH_SIZE + 1)
        ]
        admin = FakeAdmin(
            {
                "household_members": [
                    {"household_id": "home", "user_id": "member"}
                ],
                "push_notification_devices": devices,
            }
        )

        def response(_url, messages, _access_token):
            return {
                "data": [
                    {"status": "ok", "id": f"receipt-{message['to']}"}
                    for message in messages
                ]
            }

        with patch("server.push_notifications._post_json", side_effect=response) as post:
            send_household_recipe_notification(
                admin,
                "expo-secret",
                "home",
                "actor",
                "Nanda",
                "added",
                "22222222-2222-4222-8222-222222222222",
                "Noodles",
            )

        self.assertEqual([PUSH_BATCH_SIZE, 1], [len(call.args[1]) for call in post.call_args_list])

    def test_receipt_removes_unregistered_device(self):
        admin = FakeAdmin(
            {
                "push_notification_tickets": [
                    {
                        "receipt_id": "receipt-1",
                        "expo_push_token": "ExponentPushToken[stale]",
                        "created_at": "2026-09-06T00:00:00+00:00",
                    }
                ]
            }
        )
        receipt = {
            "data": {
                "receipt-1": {
                    "status": "error",
                    "details": {"error": "DeviceNotRegistered"},
                }
            }
        }
        with patch("server.push_notifications._post_json", return_value=receipt):
            check_push_receipts(
                admin,
                "expo-secret",
                datetime(2026, 9, 6, 1, tzinfo=timezone.utc),
            )

        deleted_tables = [table for table, _filters in admin.deletes]
        self.assertIn("push_notification_devices", deleted_tables)
        self.assertIn("push_notification_tickets", deleted_tables)

    def test_missing_receipts_are_retried_then_expire_after_24_hours(self):
        admin = FakeAdmin(
            {
                "push_notification_tickets": [
                    {
                        "receipt_id": "fresh",
                        "expo_push_token": "ExponentPushToken[fresh]",
                        "created_at": "2026-09-06T00:30:00+00:00",
                    },
                    {
                        "receipt_id": "expired",
                        "expo_push_token": "ExponentPushToken[expired]",
                        "created_at": "2026-09-04T23:00:00+00:00",
                    },
                ]
            }
        )
        with patch(
            "server.push_notifications._post_json",
            return_value={"data": {}},
        ):
            check_push_receipts(
                admin,
                "expo-secret",
                datetime(2026, 9, 6, 1, tzinfo=timezone.utc),
            )

        ticket_deletes = [
            filters for table, filters in admin.deletes
            if table == "push_notification_tickets"
        ]
        self.assertEqual(
            [[("in", "receipt_id", ["expired"])]],
            ticket_deletes,
        )

    def test_delivery_failure_is_isolated_from_the_recipe_request(self):
        with (
            patch("server.modules.notifications.service.settings.supabase_service_role_key", SecretStr("service")),
            patch("server.modules.notifications.service.settings.expo_access_token", SecretStr("expo")),
            patch("server.modules.notifications.service.get_admin_supabase", return_value=FakeAdmin()),
            patch(
                "server.modules.notifications.service.send_household_recipe_notification",
                side_effect=RuntimeError("offline"),
            ),
        ):
            deliver_household_recipe_notification(
                "home",
                "actor",
                "Nanda",
                "edited",
                "22222222-2222-4222-8222-222222222222",
                "Noodles",
            )


class ExpoHttpRetryTest(unittest.TestCase):
    def test_retries_transient_failures_with_a_bound(self):
        responses = [
            SimpleNamespace(status=429, data=b"{}"),
            SimpleNamespace(status=503, data=b"{}"),
            SimpleNamespace(status=200, data=b'{"data": []}'),
        ]
        with (
            patch("server.push_notifications._http.request", side_effect=responses) as request,
            patch("server.push_notifications.sleep") as wait,
        ):
            result = _post_json("https://example.test", [], "token")

        self.assertEqual({"data": []}, result)
        self.assertEqual(3, request.call_count)
        self.assertEqual([1, 2], [call.args[0] for call in wait.call_args_list])

    def test_does_not_retry_a_permanent_rejection(self):
        response = SimpleNamespace(status=400, data=b"{}")
        with patch(
            "server.push_notifications._http.request",
            return_value=response,
        ) as request:
            with self.assertRaises(RuntimeError):
                _post_json("https://example.test", [], "token")

        self.assertEqual(1, request.call_count)


class NotificationDeviceEndpointTest(unittest.TestCase):
    def setUp(self):
        self.admin = FakeAdmin()
        self.auth = SimpleNamespace(user=SimpleNamespace(id="user-1"))

    def test_registration_rotates_and_unregistration_is_owner_scoped(self):
        with patch("server.modules.notifications.service.get_admin_supabase", return_value=self.admin):
            registered = register_notification_device(
                NotificationDeviceRegistration(
                    expo_push_token="ExponentPushToken[new-token]",
                    previous_expo_push_token="ExponentPushToken[old-token]",
                    platform="android",
                ),
                self.auth,
            )
            removed = unregister_notification_device(
                NotificationDeviceRemoval(
                    expo_push_token="ExponentPushToken[new-token]"
                ),
                self.auth,
            )

        self.assertEqual(204, registered.status_code)
        self.assertEqual(204, removed.status_code)
        self.assertEqual(
            "user-1",
            self.admin.upserts["push_notification_devices"][0]["user_id"],
        )
        for table, filters in self.admin.deletes:
            if table == "push_notification_devices":
                self.assertIn(("eq", "user_id", "user-1"), filters)

    def test_device_endpoints_do_not_require_expo_credentials(self):
        with (
            patch("server.modules.notifications.service.settings.supabase_url", "https://example.supabase.co"),
            patch("server.modules.notifications.service.settings.supabase_service_role_key", SecretStr("service-role")),
            patch("server.modules.notifications.service.settings.expo_access_token", None),
            patch("server.core.database.create_client", return_value=self.admin) as create_client,
            patch("server.modules.notifications.service.send_household_recipe_notification") as send,
        ):
            registered = register_notification_device(
                NotificationDeviceRegistration(
                    expo_push_token="ExponentPushToken[token]", platform="android",
                ),
                self.auth,
            )
            removed = unregister_notification_device(
                NotificationDeviceRemoval(expo_push_token="ExponentPushToken[token]"),
                self.auth,
            )
            deliver_household_recipe_notification(
                "household", "user-1", "Tara", "added", "recipe", "Soup",
            )

        self.assertEqual(204, registered.status_code)
        self.assertEqual(204, removed.status_code)
        create_client.assert_called_with("https://example.supabase.co", "service-role")
        send.assert_not_called()

    def test_admin_client_requires_supabase_credentials(self):
        for url, key in [("", SecretStr("service-role")), ("https://example.supabase.co", None)]:
            with (
                self.subTest(url=url, has_key=key is not None),
                patch("server.modules.notifications.service.settings.supabase_url", url),
                patch("server.modules.notifications.service.settings.supabase_service_role_key", key),
                patch("server.core.database.create_client") as create_client,
            ):
                with self.assertRaises(HTTPException) as raised:
                    get_admin_supabase()
                self.assertEqual(503, raised.exception.status_code)
                self.assertEqual("Supabase admin credentials are missing", raised.exception.detail)
                create_client.assert_not_called()

    def test_registration_cannot_take_over_another_users_token(self):
        self.admin.rows["push_notification_devices"] = [
            {
                "expo_push_token": "ExponentPushToken[other-token]",
                "user_id": "user-2",
            }
        ]

        with patch("server.modules.notifications.service.get_admin_supabase", return_value=self.admin):
            with self.assertRaises(HTTPException) as raised:
                register_notification_device(
                    NotificationDeviceRegistration(
                        expo_push_token="ExponentPushToken[other-token]",
                        platform="ios",
                    ),
                    self.auth,
                )

        self.assertEqual(409, raised.exception.status_code)
        self.assertNotIn("push_notification_devices", self.admin.upserts)


if __name__ == "__main__":
    unittest.main()
