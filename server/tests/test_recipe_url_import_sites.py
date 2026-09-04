import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from server.main import ImportRecipeUrlRequest, import_recipe_url
from server.recipe_url_import import FetchedRecipePage


FIXTURE_DIR = Path(__file__).resolve().parents[1] / "fixtures"


def import_fixture(filename: str, url: str):
    # NOTE: Site regressions mock only the network boundary so the extractor,
    # normalization, fallback, and enrichment pipeline stays under test.
    html = (FIXTURE_DIR / filename).read_text()
    payload = ImportRecipeUrlRequest(url=url)
    page = FetchedRecipePage(
        html=html,
        url=url,
        hostname=payload.url.host or "unknown",
        response_size=len(html.encode()),
    )
    with patch("server.main.fetch_public_html", return_value=page):
        return import_recipe_url(payload, _auth=Mock())


class ImportRecipeUrlSiteTest(unittest.TestCase):
    def test_imports_recipe_microdata(self):
        draft = import_fixture(
            "recipe_url_import_microdata.html",
            "https://example.com/tomato-soup",
        )

        self.assertEqual("Tomato Soup", draft.title)
        self.assertEqual(2, len(draft.ingredients[0].items))
        self.assertEqual(
            ["Simmer the tomatoes.", "Blend until smooth."],
            [step.text for step in draft.instructions[0].steps],
        )
        self.assertEqual(4, draft.servings)
        self.assertEqual(10, draft.prep_time_minutes)
        self.assertEqual(20, draft.cook_time_minutes)

    def test_imports_grouped_wprm_recipe_without_noise_or_duplicates(self):
        draft = import_fixture(
            "recipe_url_import_wprm.html",
            "https://www.budgetbytes.com/macaroni-salad/",
        )

        self.assertEqual("Macaroni Salad", draft.title)
        self.assertEqual(
            [None, "Dressing"],
            [group.title for group in draft.ingredients],
        )
        self.assertEqual([2, 2], [len(group.items) for group in draft.ingredients])
        self.assertEqual(
            [
                "Cook the macaroni, then drain and cool it.",
                "Mix the dressing and fold it into the macaroni.",
            ],
            [step.text for step in draft.instructions[0].steps],
        )
        self.assertEqual(8, draft.servings)
        self.assertEqual(15, draft.prep_time_minutes)
        self.assertEqual(10, draft.cook_time_minutes)
        self.assertEqual(332, draft.nutrition_per_serving.calories_kcal)
        self.assertEqual(6, draft.nutrition_per_serving.protein_g)
        self.assertEqual(
            "https://images.example.com/macaroni-salad.jpg",
            str(draft.image_url),
        )

        core_text = [
            item.name
            for group in draft.ingredients
            for item in group.items
        ] + [
            step.text
            for group in draft.instructions
            for step in group.steps
        ]
        self.assertEqual(len(core_text), len(set(core_text)))
        self.assertNotIn("Print Recipe", core_text)
        self.assertNotIn("Cook Mode", core_text)


if __name__ == "__main__":
    unittest.main()
