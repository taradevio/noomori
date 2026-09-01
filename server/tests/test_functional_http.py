# NOTE: Retrospective regression coverage for behavior implemented before TDD adoption.
import os
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault(
    "HOUSEHOLD_JOIN_CODE_HMAC_KEY",
    "0123456789abcdef0123456789abcdef",
)

import httpx  # noqa: E402

from server.main import (  # noqa: E402
    app,
    get_current_user,
)


USER_ID = "11111111-1111-4111-8111-111111111111"
RECIPE_ID = "22222222-2222-4222-8222-222222222222"
SECOND_RECIPE_ID = "22222222-2222-4222-8222-333333333333"
COOKBOOK_ID = "33333333-3333-4333-8333-333333333333"
RECIPE_CREATION_HEADERS = {"Recipe-Creation-Id": RECIPE_ID}


def recipe(**changes):
    value = {
        "id": RECIPE_ID,
        "owner_user_id": USER_ID,
        "title": "Soup",
        "description": None,
        "image_path": None,
        "image_url": None,
        "ingredients": [
            {
                "title": None,
                "items": [
                    {
                        "name": "stock",
                        "quantity": 1,
                        "unit": "cup",
                        "note": None,
                    }
                ],
            }
        ],
        "instructions": [{"title": None, "steps": [{"text": "Simmer."}]}],
        "servings": 2,
        "prep_time_minutes": 5,
        "cook_time_minutes": 20,
        "nutrition_per_serving": None,
        "source_type": "my_recipe",
        "source_person_name": None,
        "source_url": None,
        "household_recipe_shares": [],
    }
    value.update(changes)
    return value


def recipe_payload(**changes):
    value = {
        "title": "Soup",
        "description": None,
        "ingredients": [
            {
                "title": None,
                "items": [
                    {
                        "name": "stock",
                        "quantity": 1,
                        "unit": "cup",
                        "note": None,
                    }
                ],
            }
        ],
        "instructions": [{"title": None, "steps": [{"text": "Simmer."}]}],
        "servings": 2,
        "prep_time_minutes": 5,
        "cook_time_minutes": 20,
        "nutrition_per_serving": None,
        "source_type": "my_recipe",
        "source_person_name": None,
        "source_url": None,
    }
    value.update(changes)
    return value


class FakeBucket:
    def __init__(self):
        self.removed = []

    def info(self, _path):
        return {"metadata": {"mimetype": "image/webp", "size": 1024}}

    def remove(self, paths):
        self.removed.extend(paths)

    def create_signed_url(self, path, _expires_in):
        return {"signedURL": f"https://images.test/{path}"}

    def create_signed_urls(self, paths, _expires_in):
        return [
            {"path": path, "signedURL": f"https://images.test/{path}"}
            for path in paths
        ]


class FakeStorage:
    def __init__(self):
        self.bucket = FakeBucket()

    def from_(self, _name):
        return self.bucket


class FakeQuery:
    def __init__(self, database, table):
        self.database = database
        self.table = table
        self.operation = "select"
        self.values = None

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def order(self, _column, desc=False):
        return self

    def in_(self, _column, _values):
        return self

    def insert(self, values):
        self.operation = "insert"
        self.values = values
        return self

    def upsert(self, values, on_conflict=""):
        self.operation = "upsert"
        self.values = values
        return self

    def update(self, values):
        self.operation = "update"
        self.values = values
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        self.database.calls.append((self.table, self.operation, self.values))
        configured = self.database.responses.get((self.table, self.operation))
        if configured is not None:
            return SimpleNamespace(data=configured)
        if self.table == "recipes" and self.operation == "upsert":
            recipe_id = self.values["id"]
            stored = recipe(**{
                **self.database.recipe_rows.get(recipe_id, {}),
                **self.values,
            })
            self.database.recipe_rows[recipe_id] = stored
            return SimpleNamespace(data=[stored])
        if self.table == "recipes" and self.operation in {"insert", "update"}:
            return SimpleNamespace(data=[recipe(**(self.values or {}))])
        if self.operation == "delete":
            return SimpleNamespace(data=[{"id": RECIPE_ID}])
        return SimpleNamespace(data=[])


class FakeRpc:
    def __init__(self, database, name, params):
        self.database = database
        self.name = name
        self.params = params

    def execute(self):
        self.database.rpc_calls.append((self.name, self.params))
        return SimpleNamespace(data=self.database.rpc_results.get(self.name, {"status": "OK"}))


class FakeDatabase:
    def __init__(self):
        self.calls = []
        self.responses = {}
        self.rpc_calls = []
        self.rpc_results = {}
        self.recipe_rows = {}
        self.storage = FakeStorage()

    def table(self, name):
        return FakeQuery(self, name)

    def rpc(self, name, params=None):
        return FakeRpc(self, name, params or {})


class FunctionalHttpTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.database = FakeDatabase()
        self.auth = SimpleNamespace(
            user=SimpleNamespace(id=USER_ID),
            supabase=self.database,
        )
        async def auth_override():
            return self.auth

        async def run_directly(function, *args, **kwargs):
            return function(*args, **kwargs)

        # Keep the ASGI/HTTP boundary real while executing synchronous handlers
        # deterministically inline; handler behavior is also covered by the
        # lower-level regression suite.
        self.threadpool_patch = patch(
            "fastapi.routing.run_in_threadpool", new=run_directly
        )
        self.threadpool_patch.start()
        app.dependency_overrides[get_current_user] = auth_override
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        )

    async def asyncTearDown(self):
        app.dependency_overrides.clear()
        self.threadpool_patch.stop()
        await self.client.aclose()

    async def test_health_is_public_and_protected_routes_require_authentication(self):
        health = await self.client.get("/api/v1/health")
        self.assertEqual({"status": "ok"}, health.json())

        app.dependency_overrides.clear()
        response = await self.client.get("/recipes")
        self.assertEqual(401, response.status_code)

    async def test_recipe_text_import_and_request_validation_use_http_contracts(self):
        response = await self.client.post(
            "/recipes/import/text",
            json={
                "text": "Soup\nIngredients\n1 cup stock\nInstructions\nSimmer."
            },
        )
        self.assertEqual(200, response.status_code)
        self.assertEqual("Soup", response.json()["title"])
        self.assertEqual(1, response.json()["ingredients"][0]["items"][0]["quantity"])

        invalid = await self.client.post("/recipes/import/text", json={"text": "   "})
        self.assertEqual(422, invalid.status_code)

    async def test_recipe_url_and_image_import_map_success_at_the_route_boundary(self):
        draft = {
            "title": "Imported soup",
            "description": None,
            "ingredients": [],
            "instructions": [],
            "servings": None,
            "prep_time_minutes": None,
            "cook_time_minutes": None,
            "nutrition_per_serving": None,
            "image_url": None,
        }
        fetched_page = SimpleNamespace(
            hostname="example.com",
            response_size=100,
            html="<html></html>",
            url="https://example.com/soup",
        )
        extracted = SimpleNamespace(ingredient_groups=[], instructions=[])
        fetched_image = SimpleNamespace(
            body=b"image",
            content_type="image/webp",
            hostname="example.com",
            response_size=5,
        )
        with ExitStack() as stack:
            stack.enter_context(
                patch("server.main.fetch_public_html", return_value=fetched_page)
            )
            stack.enter_context(patch("server.main.extract_recipe", return_value=extracted))
            stack.enter_context(
                patch("server.main.normalize_imported_website_recipe", return_value=draft)
            )
            url_response = await self.client.post(
                "/recipes/import/url",
                json={"url": "https://example.com/soup"},
            )
            stack.enter_context(patch("server.main.fetch_public_image", return_value=fetched_image))
            image_response = await self.client.post(
                "/recipes/import/image",
                json={"url": "https://example.com/soup.webp"},
            )

        self.assertEqual(200, url_response.status_code)
        self.assertEqual("Imported soup", url_response.json()["title"])
        self.assertEqual(200, image_response.status_code)
        self.assertEqual("image/webp", image_response.headers["content-type"])
        self.assertEqual(b"image", image_response.content)

    async def test_recipe_list_detail_create_and_update_return_canonical_json(self):
        self.database.responses[("recipes", "select")] = [recipe()]
        with patch("server.main.recipes_with_signed_images", side_effect=lambda _auth, rows: rows):
            listed = await self.client.get("/recipes")
        self.assertEqual(200, listed.status_code)
        self.assertEqual(RECIPE_ID, listed.json()[0]["id"])

        with ExitStack() as stack:
            stack.enter_context(patch("server.main.get_readable_recipe", return_value=recipe()))
            stack.enter_context(patch("server.main.recipe_with_signed_image", side_effect=lambda _a, row: row))
            detail = await self.client.get(f"/recipes/{RECIPE_ID}")
            created = await self.client.post(
                "/recipes",
                headers=RECIPE_CREATION_HEADERS,
                json=recipe_payload(),
            )
            updated = await self.client.put(
                f"/recipes/{RECIPE_ID}",
                json=recipe_payload(title="Updated soup"),
            )

        self.assertEqual("Soup", detail.json()["title"])
        self.assertEqual(200, created.status_code)
        self.assertEqual("Updated soup", updated.json()["title"])

    async def test_recipe_creation_is_idempotent_and_last_write_wins(self):
        first = await self.client.post(
            "/recipes",
            headers=RECIPE_CREATION_HEADERS,
            json=recipe_payload(title="First draft"),
        )
        image_path = f"recipes/{USER_ID}/{RECIPE_ID}/cover.webp"
        self.database.recipe_rows[RECIPE_ID]["image_path"] = image_path
        second = await self.client.post(
            "/add-recipes",
            headers=RECIPE_CREATION_HEADERS,
            json=recipe_payload(title="Latest draft"),
        )

        self.assertEqual(200, first.status_code)
        self.assertEqual(200, second.status_code)
        self.assertEqual(RECIPE_ID, first.json()["id"])
        self.assertEqual(RECIPE_ID, second.json()["id"])
        self.assertEqual("Latest draft", second.json()["title"])
        self.assertEqual(image_path, second.json()["image_path"])
        self.assertEqual(1, len(self.database.recipe_rows))

        separate = await self.client.post(
            "/recipes",
            headers={"Recipe-Creation-Id": SECOND_RECIPE_ID},
            json=recipe_payload(title="Latest draft"),
        )
        self.assertEqual(200, separate.status_code)
        self.assertEqual(SECOND_RECIPE_ID, separate.json()["id"])
        self.assertEqual(2, len(self.database.recipe_rows))

    async def test_recipe_share_delete_and_image_routes_cover_mutation_contracts(self):
        shared = recipe(is_shared=True)
        with patch("server.main.set_recipe_shared", return_value=shared) as set_shared:
            shared_response = await self.client.put(f"/recipes/{RECIPE_ID}/share")
            unshared_response = await self.client.delete(f"/recipes/{RECIPE_ID}/share")
            self.assertEqual(200, shared_response.status_code)
            self.assertEqual(200, unshared_response.status_code)
        self.assertEqual([True, False], [call.args[1] for call in set_shared.call_args_list])

        with patch("server.main.get_owned_recipe", return_value=recipe()):
            deleted = await self.client.delete(f"/recipes/{RECIPE_ID}")
        self.assertEqual(204, deleted.status_code)

        image_path = (
            f"recipes/{USER_ID}/{RECIPE_ID}/"
            "44444444-4444-4444-8444-444444444444.webp"
        )
        with ExitStack() as stack:
            stack.enter_context(patch("server.main.get_owned_recipe", return_value=recipe()))
            stack.enter_context(patch("server.main.recipe_with_signed_image", side_effect=lambda _a, row: row))
            activated = await self.client.put(
                f"/recipes/{RECIPE_ID}/image",
                json={"image_path": image_path},
            )
            removed = await self.client.delete(f"/recipes/{RECIPE_ID}/image")
        self.assertEqual(200, activated.status_code)
        self.assertEqual(image_path, activated.json()["image_path"])
        self.assertEqual(200, removed.status_code)
        self.assertIsNone(removed.json()["image_path"])

    async def test_recipe_validation_rejects_invalid_uuid_and_source_rules(self):
        invalid_uuid = await self.client.get("/recipes/not-a-uuid")
        self.assertEqual(422, invalid_uuid.status_code)
        missing_creation_id = await self.client.post(
            "/recipes",
            json=recipe_payload(),
        )
        malformed_creation_id = await self.client.post(
            "/recipes",
            headers={"Recipe-Creation-Id": "not-a-uuid"},
            json=recipe_payload(),
        )
        invalid_source = await self.client.post(
            "/recipes",
            headers=RECIPE_CREATION_HEADERS,
            json=recipe_payload(source_type="website", source_url=None),
        )
        self.assertEqual(422, missing_creation_id.status_code)
        self.assertEqual(422, malformed_creation_id.status_code)
        self.assertEqual(422, invalid_source.status_code)

    async def test_cookbook_routes_cover_list_create_detail_update_membership_and_delete(self):
        summary = {
            "id": COOKBOOK_ID,
            "title": "Favorites",
            "recipe_count": 1,
            "cover_image_urls": [],
        }
        detail = {**summary, "recipes": [recipe()]}
        self.database.responses[("cookbooks", "select")] = [
            {"id": COOKBOOK_ID, "title": "Favorites", "created_at": "now"}
        ]
        self.database.responses[("cookbooks", "update")] = [
            {"id": COOKBOOK_ID, "title": "Renamed", "created_at": "now"}
        ]
        self.database.responses[("cookbooks", "delete")] = [{"id": COOKBOOK_ID}]

        with ExitStack() as stack:
            stack.enter_context(patch("server.main.cookbook_summary_rows", return_value=[summary]))
            stack.enter_context(patch("server.main.cookbook_detail", return_value=detail))
            stack.enter_context(
                patch(
                    "server.main.execute_cookbook_rpc",
                    return_value={"status": "OK", "cookbook_id": COOKBOOK_ID},
                )
            )
            listed = await self.client.get("/cookbooks")
            created = await self.client.post(
                "/cookbooks",
                json={"title": "Favorites", "recipe_ids": [RECIPE_ID]},
            )
            fetched = await self.client.get(f"/cookbooks/{COOKBOOK_ID}")
            renamed = await self.client.put(
                f"/cookbooks/{COOKBOOK_ID}", json={"title": "Renamed"}
            )
            replaced = await self.client.put(
                f"/cookbooks/{COOKBOOK_ID}/recipes",
                json={"recipe_ids": [RECIPE_ID]},
            )
            deleted = await self.client.delete(f"/cookbooks/{COOKBOOK_ID}")

        self.assertEqual([summary], listed.json())
        self.assertEqual(detail, created.json())
        self.assertEqual(detail, fetched.json())
        self.assertEqual(200, renamed.status_code)
        self.assertEqual(detail, replaced.json())
        self.assertEqual(204, deleted.status_code)

    async def test_cookbook_validation_rejects_blank_titles(self):
        response = await self.client.post(
            "/cookbooks", json={"title": "   ", "recipe_ids": []}
        )
        self.assertEqual(422, response.status_code)

    async def test_household_settings_activity_invites_join_and_leave_routes(self):
        outcomes = {
            "get_household_settings": {
                "status": "OK",
                "household_id": "home",
                "household_name": "Home",
                "role": "owner",
                "member_count": 2,
                "members": [],
                "active_code_expires_at": None,
            },
            "get_household_activity": {
                "status": "OK",
                "member_count": 2,
                "unread_count": 0,
                "latest_activity_id": 9,
                "activities": [],
            },
            "mark_household_activity_read": {"status": "OK"},
            "leave_household": {"status": "LEFT"},
            "revoke_household_join_code": {"status": "OK"},
            "preview_household_join_code": {
                "status": "OK",
                "household_name": "Home",
                "member_count": 2,
                "owner_display_name": "Tara",
            },
            "join_household_with_code": {
                "status": "JOINED",
                "household": {"id": "home", "name": "Home"},
                "membership": {
                    "household_id": "home",
                    "user_id": USER_ID,
                    "role": "member",
                },
            },
        }
        self.database.rpc_results["replace_household_join_code"] = {
            "status": "OK",
            "expires_at": "tomorrow",
        }

        def execute(_auth, name, params=None):
            return outcomes[name]

        with patch("server.main.execute_household_rpc", side_effect=execute):
            settings = await self.client.get("/household")
            activity = await self.client.get("/household/activity")
            marked = await self.client.put(
                "/household/activity/read", json={"through_activity_id": 9}
            )
            generated = await self.client.post("/household/invite")
            revoked = await self.client.delete("/household/invite")
            preview = await self.client.post(
                "/household/join/preview", json={"code": "123 456"}
            )
            joined = await self.client.post("/household/join", json={"code": "123456"})
            left = await self.client.delete("/household")

        self.assertEqual("Home", settings.json()["household_name"])
        self.assertEqual([], activity.json()["activities"])
        self.assertEqual(204, marked.status_code)
        self.assertRegex(generated.json()["code"], r"^\d{6}$")
        self.assertEqual(204, revoked.status_code)
        self.assertEqual("Home", preview.json()["household_name"])
        self.assertEqual("JOINED", joined.json()["status"])
        self.assertEqual(204, left.status_code)

    async def test_household_create_completes_owner_membership_and_profile(self):
        self.database.responses[("households", "insert")] = [
            {"id": "home", "name": "Home", "created_by": USER_ID}
        ]
        self.database.responses[("household_members", "insert")] = [
            {"household_id": "home", "user_id": USER_ID, "role": "owner"}
        ]
        self.database.responses[("profiles", "update")] = [
            {"id": USER_ID, "onboarding_completed_at": "now"}
        ]

        response = await self.client.post("/household", json={"name": "Home"})

        self.assertEqual(200, response.status_code)
        self.assertEqual("owner", response.json()["membership"]["role"])
        self.assertEqual(USER_ID, response.json()["profile"]["id"])

    async def test_household_validation_rejects_bad_codes_and_read_markers(self):
        bad_code = await self.client.post(
            "/household/join/preview", json={"code": "12-ab"}
        )
        bad_marker = await self.client.put(
            "/household/activity/read", json={"through_activity_id": 0}
        )
        self.assertEqual(422, bad_code.status_code)
        self.assertEqual(422, bad_marker.status_code)


if __name__ == "__main__":
    unittest.main()
