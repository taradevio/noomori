import unittest
from types import SimpleNamespace
from uuid import UUID

from fastapi import HTTPException

from server.main import (
    list_household_recipes,
    list_recipes,
    share_recipe,
    unshare_recipe,
)


class FakeRecipeTable:
    def __init__(self, recipe):
        self.recipe = recipe

    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def limit(self, _value):
        return self

    def execute(self):
        return SimpleNamespace(data=[dict(self.recipe)])


class FakeRpc:
    def __init__(self, supabase, shared):
        self.supabase = supabase
        self.shared = shared

    def execute(self):
        status = self.supabase.status
        if status == "OK":
            self.supabase.recipe["household_recipe_shares"] = (
                [{"recipe_id": self.supabase.recipe["id"]}]
                if self.shared
                else []
            )
        return SimpleNamespace(data={"status": status})


class FakeSupabase:
    def __init__(self, recipe, status="OK"):
        self.recipe = recipe
        self.status = status
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return FakeRpc(self, params["p_shared"])

    def table(self, name):
        assert name == "recipes"
        return FakeRecipeTable(self.recipe)


class RecipeSharingTest(unittest.TestCase):
    recipe_id = UUID("22222222-2222-4222-8222-222222222222")
    owner_id = "11111111-1111-4111-8111-111111111111"

    def auth(self, status="OK"):
        recipe = {
            "id": str(self.recipe_id),
            "owner_user_id": self.owner_id,
            "image_path": None,
            "household_recipe_shares": [],
        }
        return SimpleNamespace(
            user=SimpleNamespace(id=self.owner_id),
            supabase=FakeSupabase(recipe, status),
        )

    def test_share_and_unshare_are_idempotent_and_return_state(self):
        auth = self.auth()

        self.assertTrue(share_recipe(self.recipe_id, auth)["is_shared"])
        self.assertTrue(share_recipe(self.recipe_id, auth)["is_shared"])
        self.assertFalse(unshare_recipe(self.recipe_id, auth)["is_shared"])
        self.assertFalse(unshare_recipe(self.recipe_id, auth)["is_shared"])
        self.assertEqual(
            [True, True, False, False],
            [call[1]["p_shared"] for call in auth.supabase.calls],
        )

    def test_one_person_household_cannot_share(self):
        with self.assertRaises(HTTPException) as raised:
            share_recipe(self.recipe_id, self.auth("HOUSEHOLD_NOT_READY"))

        self.assertEqual(409, raised.exception.status_code)

    def test_non_owner_cannot_change_sharing(self):
        with self.assertRaises(HTTPException) as raised:
            share_recipe(self.recipe_id, self.auth("RECIPE_NOT_FOUND"))

        self.assertEqual(404, raised.exception.status_code)


class FakeRecipeListTable:
    def __init__(self, recipes):
        self.recipes = recipes
        self.columns = ""
        self.filters = {}
        self.ordering = None

    def select(self, columns):
        self.columns = columns
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def order(self, column, desc=False):
        self.ordering = (column, desc)
        return self

    def execute(self):
        recipes = [
            recipe
            for recipe in self.recipes
            if all(recipe.get(key) == value for key, value in self.filters.items())
        ]
        if "!inner" in self.columns:
            recipes = [recipe for recipe in recipes if recipe["household_recipe_shares"]]
        return SimpleNamespace(data=recipes)


class FakeRecipeListSupabase:
    def __init__(self, recipes):
        self.recipes = FakeRecipeListTable(recipes)

    def table(self, name):
        assert name == "recipes"
        return self.recipes


class RecipeListScopeTest(unittest.TestCase):
    owner_id = "11111111-1111-4111-8111-111111111111"

    def auth(self):
        recipes = [
            {
                "id": "own-shared",
                "owner_user_id": self.owner_id,
                "image_path": None,
                "household_recipe_shares": [{"recipe_id": "own-shared"}],
            },
            {
                "id": "own-private",
                "owner_user_id": self.owner_id,
                "image_path": None,
                "household_recipe_shares": [],
            },
            {
                "id": "peer-shared",
                "owner_user_id": "peer",
                "image_path": None,
                "household_recipe_shares": [{"recipe_id": "peer-shared"}],
            },
            {
                "id": "peer-private",
                "owner_user_id": "peer",
                "image_path": None,
                "household_recipe_shares": [],
            },
        ]
        return SimpleNamespace(
            user=SimpleNamespace(id=self.owner_id),
            supabase=FakeRecipeListSupabase(recipes),
        )

    def test_personal_list_filters_by_authenticated_owner(self):
        auth = self.auth()

        recipes = list_recipes(auth)

        self.assertEqual(
            ["own-shared", "own-private"],
            [item["id"] for item in recipes],
        )
        self.assertEqual(("created_at", True), auth.supabase.recipes.ordering)
        self.assertTrue(recipes[0]["is_shared"])
        self.assertFalse(recipes[1]["is_shared"])

    def test_household_list_requires_a_visible_share(self):
        auth = self.auth()

        recipes = list_household_recipes(auth)

        self.assertEqual(
            ["own-shared", "peer-shared"],
            [item["id"] for item in recipes],
        )
        self.assertTrue(all(item["is_shared"] for item in recipes))


if __name__ == "__main__":
    unittest.main()
