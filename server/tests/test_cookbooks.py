import unittest
from types import SimpleNamespace
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError

from server.main import (
    CookbookTitle,
    CreateCookbook,
    ReplaceCookbookRecipes,
    create_cookbook,
    delete_cookbook,
    list_cookbooks,
    rename_cookbook,
    replace_cookbook_recipes,
)


OWNER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_ID = "99999999-9999-4999-8999-999999999999"
COOKBOOK_ID = UUID("22222222-2222-4222-8222-222222222222")
RECIPE_ID = UUID("33333333-3333-4333-8333-333333333333")


class FakeStorageBucket:
    def create_signed_urls(self, paths, _expires_in):
        return [{"path": path, "signedURL": f"https://images/{path}"} for path in paths]


class FakeStorage:
    def from_(self, _bucket):
        return FakeStorageBucket()


class FakeQuery:
    def __init__(self, database, table, operation="select", values=None):
        self.database = database
        self.table = table
        self.operation = operation
        self.values = values
        self.filters = {}
        self.in_filters = {}
        self.ordering = None

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters[column] = str(value)
        return self

    def in_(self, column, values):
        self.in_filters[column] = {str(value) for value in values}
        return self

    def order(self, column, desc=False):
        self.ordering = (column, desc)
        return self

    def limit(self, _value):
        return self

    def update(self, values):
        self.operation = "update"
        self.values = values
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def _matches(self, row):
        return all(str(row.get(key)) == value for key, value in self.filters.items()) and all(
            str(row.get(key)) in values for key, values in self.in_filters.items()
        )

    def execute(self):
        rows = self.database.tables[self.table]
        matches = [row for row in rows if self._matches(row)]
        if self.operation == "update":
            for row in matches:
                row.update(self.values)
        elif self.operation == "delete":
            self.database.tables[self.table] = [row for row in rows if row not in matches]
            if self.table == "cookbooks":
                deleted_ids = {row["id"] for row in matches}
                self.database.tables["cookbook_recipes"] = [
                    row
                    for row in self.database.tables["cookbook_recipes"]
                    if row["cookbook_id"] not in deleted_ids
                ]
        if self.ordering:
            column, desc = self.ordering
            matches.sort(key=lambda row: row.get(column, ""), reverse=desc)
        return SimpleNamespace(data=[dict(row) for row in matches])


class FakeRpc:
    def __init__(self, database, name, params):
        self.database = database
        self.name = name
        self.params = params

    def execute(self):
        status = self.database.next_rpc_status
        self.database.next_rpc_status = "OK"
        if status != "OK":
            return SimpleNamespace(data={"status": status})

        if self.name == "create_personal_cookbook":
            cookbook_id = str(COOKBOOK_ID)
            self.database.tables["cookbooks"].append(
                {
                    "id": cookbook_id,
                    "owner_user_id": OWNER_ID,
                    "title": self.params["p_title"],
                    "created_at": "2026-08-29T12:00:00Z",
                }
            )
            self.database.tables["cookbook_recipes"].extend(
                {
                    "cookbook_id": cookbook_id,
                    "recipe_id": recipe_id,
                }
                for recipe_id in self.params["p_recipe_ids"]
            )
            return SimpleNamespace(data={"status": "OK", "cookbook_id": cookbook_id})

        cookbook_id = self.params["p_cookbook_id"]
        self.database.tables["cookbook_recipes"] = [
            row
            for row in self.database.tables["cookbook_recipes"]
            if row["cookbook_id"] != cookbook_id
        ]
        self.database.tables["cookbook_recipes"].extend(
            {"cookbook_id": cookbook_id, "recipe_id": recipe_id}
            for recipe_id in self.params["p_recipe_ids"]
        )
        return SimpleNamespace(data={"status": "OK"})


class FakeDatabase:
    def __init__(self):
        recipe = {
            "id": str(RECIPE_ID),
            "owner_user_id": OWNER_ID,
            "title": "Soup",
            "image_path": "recipes/owner/recipe/photo.webp",
            "created_at": "2026-08-29T11:00:00Z",
            "household_recipe_shares": [],
        }
        self.tables = {
            "cookbooks": [
                {
                    "id": str(COOKBOOK_ID),
                    "owner_user_id": OWNER_ID,
                    "title": "Weeknight",
                    "created_at": "2026-08-29T12:00:00Z",
                },
                {
                    "id": "88888888-8888-4888-8888-888888888888",
                    "owner_user_id": OTHER_ID,
                    "title": "Private peer book",
                    "created_at": "2026-08-29T13:00:00Z",
                },
            ],
            "cookbook_recipes": [
                {"cookbook_id": str(COOKBOOK_ID), "recipe_id": str(RECIPE_ID)}
            ],
            "recipes": [recipe],
        }
        self.storage = FakeStorage()
        self.next_rpc_status = "OK"
        self.rpc_calls = []

    def table(self, name):
        return FakeQuery(self, name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        return FakeRpc(self, name, params)


class CookbookTest(unittest.TestCase):
    def auth(self):
        database = FakeDatabase()
        return SimpleNamespace(user=SimpleNamespace(id=OWNER_ID), supabase=database)

    def test_title_is_trimmed_and_blank_is_rejected(self):
        self.assertEqual("Weeknight", CookbookTitle(title="  Weeknight  ").title)
        with self.assertRaises(ValidationError):
            CookbookTitle(title="   ")

    def test_list_is_personal_and_includes_count_and_signed_cover(self):
        result = list_cookbooks(self.auth())

        self.assertEqual(1, len(result))
        self.assertEqual("Weeknight", result[0]["title"])
        self.assertEqual(1, result[0]["recipe_count"])
        self.assertEqual(
            ["https://images/recipes/owner/recipe/photo.webp"],
            result[0]["cover_image_urls"],
        )

    def test_create_deduplicates_membership_and_returns_detail(self):
        auth = self.auth()
        auth.supabase.tables["cookbooks"] = []
        auth.supabase.tables["cookbook_recipes"] = []

        result = create_cookbook(
            CreateCookbook(title="Favorites", recipe_ids=[RECIPE_ID, RECIPE_ID]),
            auth,
        )

        self.assertEqual("Favorites", result["title"])
        self.assertEqual(1, result["recipe_count"])
        self.assertEqual([str(RECIPE_ID)], auth.supabase.rpc_calls[0][1]["p_recipe_ids"])

    def test_invalid_recipe_does_not_replace_existing_membership(self):
        auth = self.auth()
        auth.supabase.next_rpc_status = "INVALID_RECIPE"

        with self.assertRaises(HTTPException) as raised:
            replace_cookbook_recipes(
                COOKBOOK_ID,
                ReplaceCookbookRecipes(recipe_ids=[]),
                auth,
            )

        self.assertEqual(400, raised.exception.status_code)
        self.assertEqual(1, len(auth.supabase.tables["cookbook_recipes"]))

    def test_rename_and_delete_leave_recipe_intact(self):
        auth = self.auth()
        renamed = rename_cookbook(COOKBOOK_ID, CookbookTitle(title="Dinner"), auth)

        self.assertEqual("Dinner", renamed["title"])
        response = delete_cookbook(COOKBOOK_ID, auth)
        self.assertEqual(204, response.status_code)
        self.assertFalse(
            any(
                row["id"] == str(COOKBOOK_ID)
                for row in auth.supabase.tables["cookbooks"]
            )
        )
        self.assertEqual(1, len(auth.supabase.tables["recipes"]))


if __name__ == "__main__":
    unittest.main()
