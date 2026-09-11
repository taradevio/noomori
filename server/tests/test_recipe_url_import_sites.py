import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from recipe_scrapers import scrape_html
from recipe_scrapers.loveandlemons import LoveAndLemons

from server.modules.recipes.imports.website import import_recipe_url
from server.modules.recipes.schemas import ImportRecipeUrlRequest
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
    with patch(
        "server.modules.recipes.imports.website.fetch_public_html",
        return_value=page,
    ):
        return import_recipe_url(payload, _auth=Mock())


class ImportRecipeUrlSiteTest(unittest.TestCase):
    def test_love_and_lemons_preserves_ingredient_boundaries_through_primary_scraper(self):
        filename = "recipe_url_import_love_and_lemons.html"
        url = "https://www.loveandlemons.com/apple-crisp/"
        html = (FIXTURE_DIR / filename).read_text()
        self.assertIsInstance(scrape_html(html, url, supported_only=False), LoveAndLemons)
        with self.assertLogs("server.modules.recipes.imports.website", level="INFO") as logs:
            draft = import_fixture(filename, url)
        self.assertIn("extraction_strategy=recipe_scrapers", str(logs.output))
        self.assertEqual("Apple Crisp", draft.title)
        self.assertEqual(
            [(2, "tbsp", "all-purpose flour"), (2, "tsp", "fresh lemon juice"),
             (0.5, "tsp", "nutmeg"), (0.75, "cup", "whole rolled oats"),
             (6, None, "large apples")],
            [(item.quantity, item.unit, item.name) for group in draft.ingredients for item in group.items],
        )
        self.assertEqual(
            ["Combine the ingredients.", "Bake until the apples are tender."],
            [step.text for group in draft.instructions for step in group.steps],
        )

    def test_partial_recipe_preserves_metadata_and_unicode_ingredients(self):
        draft = import_fixture("recipe_url_import_partial_metadata.html", "https://example.com/oats")
        self.assertEqual("Cold Oats", draft.title)
        self.assertEqual([], draft.instructions)
        self.assertEqual((5, 5, "Chill", 480), (
            draft.prep_time_minutes, draft.total_time_minutes,
            draft.additional_time_label, draft.additional_time_minutes,
        ))
        self.assertEqual("Serve cold.\nYield: 1 jar", draft.description)
        flour, milk, apples = draft.ingredients[0].items
        self.assertEqual((1.5, "tbsp", "flour"), (flour.quantity, flour.unit, flour.name))
        self.assertEqual((None, None, "½–¾ cup milk"), (milk.quantity, milk.unit, milk.name))
        self.assertEqual((6, None, "large apples"), (apples.quantity, apples.unit, apples.name))

    def test_unresolved_website_passive_times_survive_primary_and_fallback(self):
        template = (FIXTURE_DIR / "recipe_url_import_partial_metadata.html").read_text()
        for metadata, label, minutes, preserved in (
            ('<div><span>Rest:</span><span>30 min</span></div>'
             '<div><span>Proof:</span><span>1 hr</span></div>', None, None, ["Rest: 30 min", "Proof: 1 hr"]),
            ('<div><span>Chill:</span><span>overnight</span></div>', None, None, ["Chill: overnight"]),
            ('<div><span>Chill:</span><span>0 min</span></div>', None, None, ["Chill: 0 min"]),
            ('<div><span>Chill:</span><span>1 hr</span></div>'
             '<div><span>Chill time:</span><span>60 min</span></div>', "Chill", 60, []),
        ):
            for fallback in (False, True):
                with self.subTest(metadata=metadata, fallback=fallback):
                    html = template.replace('<div><span>Chill:</span><span>8 hr</span></div>', metadata)
                    if fallback:
                        html = html.replace('<ul>', '<h3>Ingredients</h3><ul>', 1)
                        html = html.replace('</ul>', '</ul><h3>Instructions</h3><ol><li>Mix well.</li></ol>', 1)
                    page = FetchedRecipePage(html, "https://example.com/oats", "example.com", len(html.encode()))
                    with patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page):
                        draft = import_recipe_url(ImportRecipeUrlRequest(url=page.url), _auth=Mock())
                    self.assertEqual((label, minutes), (draft.additional_time_label, draft.additional_time_minutes))
                    self.assertEqual("\n".join(["Serve cold.", *preserved, "Yield: 1 jar"]), draft.description)
                    self.assertEqual(bool(draft.instructions), fallback)

    def test_imports_cookpad_style_ingredient_label_with_initial_untitled_group(self):
        draft = import_fixture(
            "recipe_url_import_cookpad_groups.html",
            "https://cookpad.com/example/recipes/weeknight-noodles",
        )

        self.assertEqual(
            [(None, 2), ("Spice Mix", 2)],
            [(group.title, len(group.items)) for group in draft.ingredients],
        )
        self.assertIsNone(draft.description)
        self.assertEqual(4, sum(len(group.items) for group in draft.ingredients))
        self.assertEqual(2, sum(len(group.steps) for group in draft.instructions))

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
