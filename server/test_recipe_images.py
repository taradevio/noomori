import unittest
from fastapi import HTTPException
from inspect import iscoroutinefunction
from types import SimpleNamespace
from uuid import UUID

from server.main import (
    activate_recipe_image,
    create_household,
    create_recipe,
    delete_recipe,
    get_recipe,
    list_recipes,
    recipes_with_signed_images,
    remove_recipe_image,
    update_recipe,
    valid_recipe_image_path,
)


class RecipeImagePathTest(unittest.TestCase):
    def test_accepts_only_the_canonical_owner_recipe_uuid_path(self):
        owner = "11111111-1111-4111-8111-111111111111"
        recipe = UUID("22222222-2222-4222-8222-222222222222")
        image = "33333333-3333-4333-8333-333333333333"

        self.assertTrue(
            valid_recipe_image_path(
                f"recipes/{owner}/{recipe}/{image}.webp", owner, recipe
            )
        )
        self.assertFalse(
            valid_recipe_image_path(
                f"recipes/another-user/{recipe}/{image}.webp", owner, recipe
            )
        )
        self.assertFalse(
            valid_recipe_image_path(
                f"recipes/{owner}/{recipe}/cover.webp", owner, recipe
            )
        )
        self.assertFalse(
            valid_recipe_image_path(
                f"recipes/{owner}/{recipe}/{image}.jpg", owner, recipe
            )
        )


class FakeBucket:
    def __init__(self, signed_images):
        self.calls = []
        self.signed_images = signed_images

    def create_signed_urls(self, paths, expires_in):
        self.calls.append((paths, expires_in))
        return self.signed_images


class FakeStorage:
    def __init__(self, bucket):
        self.bucket = bucket
        self.from_calls = []

    def from_(self, name):
        self.from_calls.append(name)
        return self.bucket


def fake_auth(storage):
    return SimpleNamespace(
        supabase=SimpleNamespace(storage=storage),
    )


class RecipeImageBatchSigningTest(unittest.TestCase):
    def test_zero_images_skip_storage_signing(self):
        bucket = FakeBucket([])
        storage = FakeStorage(bucket)

        recipes = recipes_with_signed_images(
            fake_auth(storage),
            [{"id": "one", "image_path": None}],
        )

        self.assertEqual([], storage.from_calls)
        self.assertIsNone(recipes[0]["image_url"])

    def test_multiple_images_use_one_batch_and_tolerate_partial_failure(self):
        first_path = "recipes/owner/one/first.webp"
        second_path = "recipes/owner/two/second.webp"
        bucket = FakeBucket(
            [
                {"path": first_path, "signedURL": "https://signed/first"},
                {"path": second_path, "error": "not found"},
            ]
        )
        storage = FakeStorage(bucket)

        recipes = recipes_with_signed_images(
            fake_auth(storage),
            [
                {"id": "one", "image_path": first_path},
                {"id": "two", "image_path": second_path},
                {"id": "three", "image_path": first_path},
            ],
        )

        self.assertEqual(1, len(bucket.calls))
        self.assertEqual(([first_path, second_path], 3600), bucket.calls[0])
        self.assertEqual("https://signed/first", recipes[0]["image_url"])
        self.assertIsNone(recipes[1]["image_url"])
        self.assertEqual("https://signed/first", recipes[2]["image_url"])

    def test_supabase_backed_handlers_are_synchronous(self):
        handlers = (
            list_recipes,
            get_recipe,
            create_recipe,
            delete_recipe,
            update_recipe,
            activate_recipe_image,
            remove_recipe_image,
            create_household,
        )
        self.assertTrue(all(not iscoroutinefunction(handler) for handler in handlers))


class FakeUpdateTable:
    def __init__(self, recipe):
        self.recipe = recipe
        self.filters = {}
        self.values = {}
        self.execute_calls = 0

    def update(self, values):
        self.values = values
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def execute(self):
        self.execute_calls += 1
        matches = self.recipe and all(
            str(self.recipe.get(column)) == str(value)
            for column, value in self.filters.items()
        )
        if not matches:
            return SimpleNamespace(data=[])
        return SimpleNamespace(data=[{**self.recipe, **self.values}])


class FakeUpdateSupabase:
    def __init__(self, recipe):
        self.table_calls = 0
        self.recipes = FakeUpdateTable(recipe)

    def table(self, name):
        self.table_calls += 1
        self.asserted_table_name = name
        return self.recipes


class RecipeUpdateTest(unittest.TestCase):
    recipe_id = UUID("22222222-2222-4222-8222-222222222222")
    owner_id = "11111111-1111-4111-8111-111111111111"

    def auth(self, recipe):
        return SimpleNamespace(
            user=SimpleNamespace(id=self.owner_id),
            supabase=FakeUpdateSupabase(recipe),
        )

    def payload(self):
        values = {"title": "Updated recipe"}
        return SimpleNamespace(model_dump=lambda mode: values)

    def test_updates_with_one_database_request(self):
        auth = self.auth(
            {
                "id": str(self.recipe_id),
                "owner_user_id": self.owner_id,
                "image_path": None,
            }
        )

        recipe = update_recipe(self.recipe_id, self.payload(), auth)

        self.assertEqual("Updated recipe", recipe["title"])
        self.assertEqual(1, auth.supabase.table_calls)
        self.assertEqual(1, auth.supabase.recipes.execute_calls)

    def test_empty_owned_update_returns_404(self):
        auth = self.auth(None)

        with self.assertRaises(HTTPException) as raised:
            update_recipe(self.recipe_id, self.payload(), auth)

        self.assertEqual(404, raised.exception.status_code)
        self.assertEqual(1, auth.supabase.table_calls)


class FakeDeleteTable:
    def __init__(self, recipe, events, fail_delete=False):
        self.recipe = recipe
        self.events = events
        self.fail_delete = fail_delete
        self.filters = {}
        self.operation = ""

    def select(self, _columns):
        self.operation = "select"
        self.filters = {}
        return self

    def delete(self):
        self.operation = "delete"
        self.filters = {}
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def limit(self, _value):
        return self

    def execute(self):
        if self.operation == "select":
            self.events.append("read")
            matches = self.recipe and all(
                str(self.recipe.get(column)) == str(value)
                for column, value in self.filters.items()
            )
            return SimpleNamespace(data=[dict(self.recipe)] if matches else [])

        self.events.append("delete")
        if self.fail_delete:
            raise RuntimeError("database unavailable")
        matches = self.recipe and all(
            str(self.recipe.get(column)) == str(value)
            for column, value in self.filters.items()
        )
        deleted = [dict(self.recipe)] if matches else []
        if matches:
            self.recipe = None
        return SimpleNamespace(data=deleted)


class FakeDeleteBucket:
    def __init__(self, events, fail_remove=False):
        self.events = events
        self.fail_remove = fail_remove

    def remove(self, _paths):
        self.events.append("storage")
        if self.fail_remove:
            raise RuntimeError("storage unavailable")


def delete_auth(user_id, recipe, events, *, fail_delete=False, fail_remove=False, role=None):
    table = FakeDeleteTable(recipe, events, fail_delete)
    bucket = FakeDeleteBucket(events, fail_remove)
    supabase = SimpleNamespace(
        table=lambda _name: table,
        storage=FakeStorage(bucket),
    )
    user = SimpleNamespace(id=user_id, household_role=role)
    return SimpleNamespace(user=user, supabase=supabase)


class RecipeDeleteTest(unittest.TestCase):
    recipe_id = UUID("22222222-2222-4222-8222-222222222222")
    owner_id = "11111111-1111-4111-8111-111111111111"
    image_path = (
        "recipes/11111111-1111-4111-8111-111111111111/"
        "22222222-2222-4222-8222-222222222222/"
        "33333333-3333-4333-8333-333333333333.webp"
    )

    def recipe(self):
        return {
            "id": str(self.recipe_id),
            "owner_user_id": self.owner_id,
            "image_path": self.image_path,
        }

    def test_creator_deletes_row_before_image_cleanup(self):
        events = []
        response = delete_recipe(
            self.recipe_id,
            delete_auth(self.owner_id, self.recipe(), events),
        )

        self.assertEqual(204, response.status_code)
        self.assertEqual(["read", "delete", "storage"], events)

    def test_other_members_and_household_owner_cannot_delete(self):
        for role in ("member", "owner"):
            with self.subTest(role=role):
                events = []
                auth = delete_auth("another-user", self.recipe(), events, role=role)
                with self.assertRaises(HTTPException) as raised:
                    delete_recipe(self.recipe_id, auth)
                self.assertEqual(404, raised.exception.status_code)
                self.assertEqual(["read"], events)

    def test_database_failure_returns_500(self):
        events = []
        auth = delete_auth(
            self.owner_id,
            self.recipe(),
            events,
            fail_delete=True,
        )
        with self.assertRaises(HTTPException) as raised:
            delete_recipe(self.recipe_id, auth)
        self.assertEqual(500, raised.exception.status_code)
        self.assertEqual(["read", "delete"], events)

    def test_storage_failure_still_returns_204(self):
        events = []
        response = delete_recipe(
            self.recipe_id,
            delete_auth(
                self.owner_id,
                self.recipe(),
                events,
                fail_remove=True,
            ),
        )
        self.assertEqual(204, response.status_code)
        self.assertEqual(["read", "delete", "storage"], events)


if __name__ == "__main__":
    unittest.main()
