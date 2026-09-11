import gzip
import logging
import socket
import threading
import unittest
import warnings
from dataclasses import replace
from datetime import datetime, timezone
from email.utils import format_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import monotonic
from unittest.mock import MagicMock, Mock, patch
from urllib.parse import urlsplit

import urllib3
from curl_cffi import Curl, CurlECode, CurlOpt
from curl_cffi import requests as curl_requests
from fastapi import HTTPException
from pydantic import ValidationError

from server.core.auth import AuthContext, get_current_user
from server.modules.recipes.imports.text import RecipeTextImportError, _dom_nutrition, parse_recipe_text
from server.modules.recipes.imports.website import (
    _enrich_primary_groups,
    import_recipe_image,
    import_recipe_url,
    normalize_imported_website_recipe,
)
from server.modules.recipes.schemas import CreateRecipe, ImportRecipeUrlRequest
from server.modules.recipes.router import router as recipe_router
from server.recipe_url_import import (
    MAX_HTML_BYTES,
    MAX_IMAGE_BYTES,
    HTML_BROWSER_PROFILE,
    HTML_USER_AGENT,
    ExtractedIngredientGroup,
    ExtractedRecipe,
    ExtractedRecipeDomMetadata,
    FetchedRecipeImage,
    FetchedRecipePage,
    WebsiteImportError,
    _curl_resolve_rule,
    _fetch_html_from_address,
    _optional_value,
    _retry_delay,
    _validated_target,
    assert_html_browser_profile_supported,
    extract_recipe,
    extract_recipe_container_text,
    extract_recipe_dom_metadata,
    fetch_public_html,
    fetch_public_image,
)


FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "recipe_url_import.html"
DOM_FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "fixtures" / "recipe_url_import_dom.html"
)
SASA_FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "fixtures" / "recipe_url_import_sasa.html"
)
DAPUR_FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "recipe_url_import_dapur_umami.html"
)
COOKPAD_FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "recipe_url_import_cookpad_groups.html"
)
SERIOUS_EATS_FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "recipe_url_import_serious_eats.html"
)
SIMPLY_RECIPES_FIXTURE_PATH = (
    Path(__file__).resolve().parents[1]
    / "fixtures"
    / "recipe_url_import_simply_recipes.html"
)
PUBLIC_ANSWER = [
    (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
]


class FakeResponse:
    def __init__(self, status=200, headers=None, chunks=None, stream_error=None):
        self.status = status
        self.headers = headers or {"Content-Type": "text/html; charset=utf-8"}
        self._chunks = chunks if chunks is not None else [b"<html></html>"]
        self._stream_error = stream_error
        self.closed = False

    def stream(self, amt=64 * 1024, decode_content=True):
        if self._stream_error:
            raise self._stream_error
        yield from self._chunks

    def close(self):
        self.closed = True


class FakePool:
    def __init__(self, response=None, error=None):
        self.response = response or FakeResponse()
        self.error = error
        self.calls = []
        self.closed = False

    def urlopen(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.error:
            raise self.error
        return self.response

    def close(self):
        self.closed = True


class PartialReadResponse(FakeResponse):
    def stream(self, amt=64 * 1024, decode_content=True):
        yield b"x" * MAX_HTML_BYTES
        raise urllib3.exceptions.ReadTimeoutError(None, "/", "timed out")


def extracted_recipe(**changes):
    values = {
        "title": "Soup",
        "description": "Simple and warm.",
        "ingredient_groups": [
            ExtractedIngredientGroup("Soup", ["1½ cups broth", "1 pinch salt"]),
        ],
        "instructions": ["Stir well."],
        "prep_time_minutes": 5,
        "cook_time_minutes": 20,
        "yield_text": "4 servings",
        "nutrients": {},
        "image_url": None,
    }
    values.update(changes)
    return ExtractedRecipe(**values)


class RecipeUrlRequestTest(unittest.TestCase):
    def test_rejects_non_http_and_oversized_urls(self):
        with self.assertRaises(ValidationError):
            ImportRecipeUrlRequest(url="ftp://example.com/recipe")
        with self.assertRaises(ValidationError):
            ImportRecipeUrlRequest(url="https://example.com/" + "x" * 2048)

    def test_recipe_timing_schema_requires_a_complete_additional_pair(self):
        values = {
            "title": "Soup",
            "ingredients": [],
            "instructions": [],
            "source_type": "my_recipe",
        }
        recipe = CreateRecipe(
            **values,
            total_time_minutes=0,
            additional_time_label="  Rest  ",
            additional_time_minutes=15,
        )
        self.assertEqual("Rest", recipe.additional_time_label)

        for timing in (
            {"additional_time_label": "Rest"},
            {"additional_time_minutes": 15},
            {"total_time_minutes": -1},
            {
                "additional_time_label": "x" * 41,
                "additional_time_minutes": 15,
            },
        ):
            with self.subTest(timing=timing), self.assertRaises(ValidationError):
                CreateRecipe(**values, **timing)


class RecipeExtractionTest(unittest.TestCase):
    def test_optional_extractor_failure_logs_only_method_and_exception_class(self):
        scraper = Mock()
        scraper.instructions_list.side_effect = ValueError("private recipe contents")
        with self.assertLogs("server.recipe_url_import", level="WARNING") as logs:
            self.assertIsNone(_optional_value(scraper, "instructions_list"))
        self.assertIn("method=instructions_list exception_type=ValueError", logs.output[0])
        self.assertNotIn("private recipe contents", str(logs.output))
        scraper.instructions_list.side_effect = None
        scraper.instructions_list.return_value = None
        with self.assertNoLogs("server.recipe_url_import"):
            self.assertIsNone(_optional_value(scraper, "instructions_list"))

    def test_extracts_and_normalizes_json_ld_fixture(self):
        extracted = extract_recipe(
            FIXTURE_PATH.read_text(),
            "https://example.com/cookies",
        )
        draft = normalize_imported_website_recipe(extracted)

        self.assertEqual("Brown Butter Cookies", draft.title)
        self.assertIsNone(draft.description)
        self.assertEqual(15, draft.prep_time_minutes)
        self.assertEqual(12, draft.cook_time_minutes)
        self.assertEqual(99, draft.total_time_minutes)
        self.assertEqual(8, draft.servings)
        self.assertEqual(1.5, draft.ingredients[0].items[0].quantity)
        self.assertEqual(0.5, draft.ingredients[0].items[1].quantity)
        self.assertEqual(2, len(draft.instructions[0].steps))
        self.assertEqual(
            "https://example.com/images/brown-butter-cookies.jpg",
            str(draft.image_url),
        )
        self.assertEqual(
            {
                "calories_kcal": 389,
                "protein_g": 5,
                "carbs_g": 53,
                "fat_g": 19,
                "saturated_fat_g": 9,
                "cholesterol_mg": 12,
                "fiber_g": 1.5,
                "sugar_g": 36,
                "sodium_mg": 0.3,
            },
            draft.nutrition_per_serving.model_dump(),
        )

    def test_preserves_groups_and_reuses_ingredient_parser(self):
        draft = normalize_imported_website_recipe(extracted_recipe())

        self.assertEqual("Soup", draft.ingredients[0].title)
        self.assertEqual((1.5, "cup"), (
            draft.ingredients[0].items[0].quantity,
            draft.ingredients[0].items[0].unit,
        ))
        self.assertIsNone(draft.instructions[0].title)

    def test_removes_only_presentation_markers_from_primary_instructions(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(
                instructions=[
                    "Langkah 1",
                    "Stir for 1 minute.",
                    "Step 2/3",
                    "Repeat step 2 if needed.",
                    "3)",
                    "Divide into 3 parts.",
                ]
            )
        )

        self.assertEqual(
            [
                "Stir for 1 minute.",
                "Repeat step 2 if needed.",
                "Divide into 3 parts.",
            ],
            [step.text for step in draft.instructions[0].steps],
        )

    def test_accepts_partial_recipe_with_two_useful_signals(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(description=None, instructions=[]),
        )
        self.assertEqual("Soup", draft.title)
        self.assertEqual([], draft.instructions)

    def test_preserves_non_serving_yield_without_publisher_description(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(yield_text="1 large loaf"),
        )
        self.assertIsNone(draft.servings)
        self.assertEqual("Yield: 1 large loaf", draft.description)

    def test_explicit_notes_override_description_and_keep_non_serving_yield(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(yield_text="1 large loaf"),
            notes="Keep refrigerated.",
            additional_time_label="Chill",
            additional_time_minutes=90,
        )

        self.assertEqual("Keep refrigerated.\nYield: 1 large loaf", draft.description)
        self.assertEqual("Chill", draft.additional_time_label)
        self.assertEqual(90, draft.additional_time_minutes)

    def test_rejects_insufficient_recipe_data(self):
        with self.assertRaises(ValueError):
            normalize_imported_website_recipe(
                extracted_recipe(
                    title=None,
                    ingredient_groups=[],
                    instructions=["Stir well."],
                )
            )

    def test_keeps_valid_nutrients_and_ignores_unsupported_or_invalid_values(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(
                nutrients={
                    "servingSize": "1 bowl",
                    "calories": "120 kcal",
                    "proteinContent": "7 grams protein",
                    "fatContent": "many grams fat",
                    "sodiumContent": "0.4 grams sodium",
                    "fiberContent": "2",
                    "sugarContent": "-1 grams sugar",
                    "transFatContent": "3 grams trans fat",
                }
            )
        )

        self.assertEqual(120, draft.nutrition_per_serving.calories_kcal)
        self.assertEqual(7, draft.nutrition_per_serving.protein_g)
        self.assertIsNone(draft.nutrition_per_serving.fat_g)
        self.assertIsNone(draft.nutrition_per_serving.sodium_mg)
        self.assertIsNone(draft.nutrition_per_serving.fiber_g)
        self.assertIsNone(draft.nutrition_per_serving.sugar_g)
        self.assertNotIn("trans", draft.nutrition_per_serving.model_dump())

    def test_returns_null_when_no_supported_nutrition_value_is_valid(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(
                nutrients={
                    "proteinContent": "7",
                    "sodiumContent": "0.4 grams sodium",
                    "transFatContent": "3 grams trans fat",
                }
            )
        )
        self.assertIsNone(draft.nutrition_per_serving)

    def test_accepts_structured_nutrition_with_trusted_serving_yield(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(nutrients={"calories": "120 kcal"})
        )
        self.assertEqual(120, draft.nutrition_per_serving.calories_kcal)

    def test_accepts_porsi_yield_for_servings_and_structured_nutrition(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(
                yield_text="4 Porsi",
                nutrients={"calories": "120 kcal"},
            )
        )
        self.assertEqual(4, draft.servings)
        self.assertEqual(120, draft.nutrition_per_serving.calories_kcal)

    def test_rejects_structured_nutrition_without_serving_semantics(self):
        for yield_text in (None, "1 loaf"):
            with self.subTest(yield_text=yield_text):
                draft = normalize_imported_website_recipe(
                    extracted_recipe(
                        yield_text=yield_text,
                        nutrients={"calories": "120 kcal"},
                    )
                )
                self.assertIsNone(draft.nutrition_per_serving)

    def test_nutrition_does_not_count_as_a_useful_recipe_signal(self):
        with self.assertRaises(ValueError):
            normalize_imported_website_recipe(
                extracted_recipe(
                    title="Soup",
                    ingredient_groups=[],
                    instructions=[],
                    nutrients={"calories": "120 calories"},
                )
            )

    def test_ignores_unsupported_or_malformed_image_urls(self):
        fixture = FIXTURE_PATH.read_text()
        for replacement in (
            '"image": "file:///tmp/recipe.jpg"',
            '"alternateName": "No image"',
        ):
            with self.subTest(replacement=replacement):
                html = fixture.replace(
                    '"image": "/images/brown-butter-cookies.jpg"',
                    replacement,
                )
                extracted = extract_recipe(html, "https://example.com/cookies")
                self.assertIsNone(extracted.image_url)

    def test_preserves_absolute_image_url(self):
        html = FIXTURE_PATH.read_text().replace(
            '"image": "/images/brown-butter-cookies.jpg"',
            '"image": "https://cdn.example.com/cookies.webp"',
        )
        extracted = extract_recipe(html, "https://example.com/cookies")
        self.assertEqual(
            "https://cdn.example.com/cookies.webp",
            extracted.image_url,
        )


class RecipeDomFallbackTest(unittest.TestCase):
    def test_relaxed_metadata_requires_explicit_identifier_and_exact_title(self):
        inner = '<h2>Cold Soup</h2><h3>Helpful Notes</h3><p>Serve cold.</p>'
        for root in ('<article>{}</article>', '<main>{}</main>',
                     '<div class="recipe-card">{}</div>'):
            html = root.format(inner)
            with self.subTest(root=root):
                if 'recipe-card' in root:
                    metadata = extract_recipe_dom_metadata(html, title=" cold   SOUP ")
                    self.assertEqual("Serve cold.", metadata.notes)
                else:
                    with self.assertRaises(WebsiteImportError):
                        extract_recipe_dom_metadata(html, title="Cold Soup")
        html = '<div class="recipe-card">' + inner + '</div>'
        for title in (None, "Other Soup", "Cold Soup Recipe"):
            with self.subTest(title=title), self.assertRaises(WebsiteImportError):
                extract_recipe_dom_metadata(html, title=title)
        with self.assertRaises(WebsiteImportError):
            extract_recipe_dom_metadata(html + html, title="Cold Soup")
        nested = '<div id="recipe"><h2>Cold Soup</h2>' + html + '</div>'
        self.assertEqual("Serve cold.", extract_recipe_dom_metadata(nested, title="Cold Soup").notes)

    def test_extracts_nested_notes_until_the_next_section(self):
        html = """
        <html><body class="content-sidebar"><article>
          <h1>Cold Soup</h1>
          <h2>Ingredients</h2><ul><li>1 cup water</li></ul>
          <h2>Method</h2><ol><li>Stir.</li></ol>
          <div><span>Chill:</span><span>1 hr 30 min</span></div>
          <section>
            <div class="heading"><h2>Tips &amp; Notes</h2></div>
            <div class="content">
              <p>Keep refrigerated.</p>
              <div><span>Serve cold.</span></div>
              <button>Share these notes</button>
              <div class="author"><p>Author biography.</p></div>
              <div class="comments"><p>Reader comment.</p></div>
              <div class="ratings"><p>Five stars.</p></div>
              <div class="purchase"><p>Buy now.</p></div>
              <div class="promotion"><p>Sponsored product.</p></div>
            </div>
          </section>
          <section><h2>Additional Info</h2><p>Not a note.</p></section>
        </article></body></html>
        """

        metadata = extract_recipe_dom_metadata(html)

        self.assertEqual("Keep refrigerated.\nServe cold.", metadata.notes)
        self.assertEqual("Chill", metadata.additional_time_label)
        self.assertEqual("1 hr 30 min", metadata.additional_time_text)

    def test_ignores_notes_outside_the_selected_recipe_root(self):
        html = """
        <main>
          <article class="recipe-card">
            <h1>Cold Soup</h1>
            <h2>Ingredients</h2><ul><li>1 cup water</li></ul>
            <h2>Method</h2><ol><li>Stir.</li></ol>
          </article>
          <section><h2>Notes</h2><p>Unrelated article notes.</p></section>
        </main>
        """

        self.assertIsNone(extract_recipe_dom_metadata(html).notes)

    def test_bounds_standalone_emphasis_notes_heading(self):
        html = """
        <article>
          <h1>Cold Soup</h1>
          <h2>Ingredients</h2><ul><li>1 cup water</li></ul>
          <h2>Method</h2><ol><li>Stir.</li></ol>
          <p><strong>Recipe Notes:</strong></p>
          <div><p>Keep refrigerated.</p></div>
          <p><strong>Storage:</strong></p>
          <p>Not a recipe note.</p>
        </article>
        """

        self.assertEqual(
            "Keep refrigerated.",
            extract_recipe_dom_metadata(html).notes,
        )

    def test_rejects_ambiguous_notes_and_passive_times_and_ignores_active(self):
        html = """
        <article>
          <h1>Bread</h1>
          <h2>Ingredients</h2><ul><li>1 cup flour</li></ul>
          <h2>Method</h2><ol><li>Mix.</li></ol>
          <div><span>Rest:</span><span>30 min</span></div>
          <div><span>Proof:</span><span>1 hr</span></div>
          <div><span>Active:</span><span>10 min</span></div>
          <h2>Notes</h2><p>First.</p>
          <h2>Recipe Notes</h2><p>Second.</p>
        </article>
        """

        metadata = extract_recipe_dom_metadata(html)

        self.assertIsNone(metadata.notes)
        self.assertIsNone(metadata.additional_time_label)
        self.assertIsNone(metadata.additional_time_text)

    def test_recognizes_only_supported_passive_time_aliases(self):
        template = """
        <article>
          <h1>Bread</h1>
          <h2>Ingredients</h2><ul><li>1 cup flour</li></ul>
          <h2>Method</h2><ol><li>Mix.</li></ol>
          <div><span>{label}:</span><span>20 min</span></div>
        </article>
        """
        for source, expected in (
            ("Rest", "Rest"),
            ("Cooling time", "Cooling"),
            ("Marinate", "Marinate"),
            ("Proof time", "Proof"),
            ("Additional time", "Additional"),
        ):
            with self.subTest(label=source):
                metadata = extract_recipe_dom_metadata(
                    template.format(label=source)
                )
                self.assertEqual(expected, metadata.additional_time_label)
                self.assertEqual("20 min", metadata.additional_time_text)

    def test_extracts_simply_recipes_nested_instruction_labels_and_paragraphs(self):
        text = extract_recipe_container_text(
            SIMPLY_RECIPES_FIXTURE_PATH.read_text(),
            max_chars=20_000,
        )
        draft = parse_recipe_text(text)

        self.assertEqual(
            [
                "Make the homemade pumpkin purée (optional)",
                "Preheat oven to 350°F (180°C)",
                "Whisk the dry ingredients",
                "Combine the wet ingredients",
                "Make the batter",
                "Bake",
                "Remove from pan and cool completely",
                "Glaze",
            ],
            [group.title for group in draft.instructions],
        )
        self.assertEqual(
            [1, 1, 1, 1, 1, 1, 1, 2],
            [len(group.steps) for group in draft.instructions],
        )
        self.assertEqual(
            "Cut and roast the pumpkin. Cool it, then scoop out the flesh.",
            draft.instructions[0].steps[0].text,
        )
        self.assertEqual(
            "Add the dry ingredients to the wet ingredients. Do not overmix.",
            draft.instructions[4].steps[0].text,
        )
        self.assertEqual("Enjoy!", draft.instructions[-1].steps[-1].text)
        for noise in (
            "Whisking the dry ingredients",
            "Recipe author",
            "Nutrition Facts",
            "Unrelated pumpkin recipes",
        ):
            with self.subTest(noise=noise):
                self.assertNotIn(noise, text)

    def test_nested_instruction_heading_must_be_leading_and_have_a_body(self):
        html = """
        <article class="recipe">
          <h1>Soup</h1>
          <h2>Ingredients</h2>
          <p>Soup:</p><ul><li>1 cup water</li></ul>
          <p>Garnish:</p><ul><li>1 leaf parsley</li></ul>
          <h2>Directions</h2>
          <ol>
            <li><h3>Prepare:</h3><p>Heat the water.</p></li>
            <li><p>Stir.</p><h3>Later heading:</h3><p>Keep stirring.</p></li>
            <li><h3>Heading only:</h3></li>
            <li><h4>Serve</h4><p>Top with parsley.</p></li>
          </ol>
        </article>
        """

        draft = parse_recipe_text(
            extract_recipe_container_text(html, max_chars=20_000)
        )

        self.assertEqual(
            ["Prepare", "Serve"],
            [group.title for group in draft.instructions],
        )
        self.assertEqual(
            [
                "Heat the water.",
                "Stir. Keep stirring.",
            ],
            [step.text for step in draft.instructions[0].steps],
        )
        self.assertEqual("Top with parsley.", draft.instructions[1].steps[0].text)

    def test_extracts_serious_eats_groups_without_later_sections(self):
        text = extract_recipe_container_text(
            SERIOUS_EATS_FIXTURE_PATH.read_text(),
            max_chars=20_000,
        )
        draft = parse_recipe_text(text)

        self.assertEqual(
            ["For the Chicken", "For the Filling", "For the Biscuit Topping"],
            [group.title for group in draft.ingredients],
        )
        self.assertEqual(
            [10, 16, 6],
            [len(group.items) for group in draft.ingredients],
        )
        self.assertEqual(
            ["For the Chicken", "For the Filling", "For Biscuit Topping"],
            [group.title for group in draft.instructions],
        )
        self.assertEqual(
            [2, 3, 2],
            [len(group.steps) for group in draft.instructions],
        )
        self.assertNotIn("\n-\n", text)
        for noise in (
            "Advertisement inside ingredients",
            "Special Equipment",
            "Unrelated storage note",
            "Related chicken recipe",
            "Unrelated recipes",
        ):
            with self.subTest(noise=noise):
                self.assertNotIn(noise, text)

    def test_extracts_realistic_sibling_section_recipe_without_later_page_noise(self):
        text = extract_recipe_container_text(
            DOM_FIXTURE_PATH.read_text(),
            max_chars=20_000,
        )
        draft = parse_recipe_text(text)

        self.assertEqual("Mild Indian Goat Curry", draft.title)
        self.assertEqual(4, len(draft.ingredients[0].items))
        self.assertEqual((500, "g"), (
            draft.ingredients[0].items[0].quantity,
            draft.ingredients[0].items[0].unit,
        ))
        self.assertEqual((150, "ml"), (
            draft.ingredients[0].items[-1].quantity,
            draft.ingredients[0].items[-1].unit,
        ))
        self.assertEqual(4, len(draft.instructions[0].steps))
        self.assertNotIn("Download Recipe", text)
        self.assertNotIn("Buy Diced Goat Meat", text)
        self.assertNotIn("Basket", text)

    def test_extracts_sasa_groups_without_controls_comments_or_later_content(self):
        text = extract_recipe_container_text(
            SASA_FIXTURE_PATH.read_text(),
            max_chars=20_000,
        )
        draft = parse_recipe_text(text)

        self.assertEqual("Tahu Bayam Cah Jamur", draft.title)
        self.assertEqual(
            [None, "Bahan-Bahan Cah Jamur", "Garnish"],
            [group.title for group in draft.ingredients],
        )
        self.assertEqual(
            [7, 12, 1],
            [len(group.items) for group in draft.ingredients],
        )
        self.assertEqual(
            ["Tahu Bayam", "Cah Jamur"],
            [group.title for group in draft.instructions],
        )
        self.assertEqual(
            [5, 7],
            [len(group.steps) for group in draft.instructions],
        )
        for noise in (
            "[if BLOCK]",
            "[if ENDBLOCK]",
            "Print Resep",
            "Produk Terkait",
            "Sasa Tepung Bumbu",
            "Resep Lainnya",
            "Nasi Goreng Spesial",
            "Artikel Terkait",
            "Tips memasak untuk keluarga.",
        ):
            with self.subTest(noise=noise):
                self.assertNotIn(noise, text)

    def test_extracts_dapur_groups_steps_and_stops_before_trailing_content(self):
        text = extract_recipe_container_text(
            DAPUR_FIXTURE_PATH.read_text(),
            max_chars=20_000,
        )
        draft = parse_recipe_text(text)

        self.assertEqual("Spring Roll Sayur ala SAORI", draft.title)
        self.assertEqual(
            ["Bahan Utama", "Bahan Isi"],
            [group.title for group in draft.ingredients],
        )
        self.assertEqual([2, 2], [len(group.items) for group in draft.ingredients])
        self.assertEqual(
            [
                "Rendam soun dalam air panas.",
                "Panaskan minyak.",
                "Ambil selembar rice paper.",
                "Isi dan gulung.",
                "Goreng hingga matang.",
            ],
            [step.text for step in draft.instructions[0].steps],
        )
        for noise in (
            "#SpringRoll",
            "Beli SAORI sekarang.",
            "Official Umami",
            "5 bintang",
            "Resepnya enak.",
        ):
            with self.subTest(noise=noise):
                self.assertNotIn(noise, text)

    def test_dom_nutrition_requires_one_confident_per_serving_block(self):
        fixture = DAPUR_FIXTURE_PATH.read_text()
        without_semantics = extract_recipe_container_text(
            fixture,
            max_chars=20_000,
        )
        with_semantics = extract_recipe_container_text(
            fixture.replace(
                "<!-- nutrition-marker -->",
                "<h2>Informasi Nilai Gizi per Porsi</h2>",
            ),
            max_chars=20_000,
        )

        self.assertIsNone(_dom_nutrition(without_semantics))
        self.assertEqual(
            {
                "calories_kcal": 181,
                "protein_g": 3,
                "carbs_g": 25.8,
                "fat_g": 7.5,
                "saturated_fat_g": None,
                "cholesterol_mg": None,
                "fiber_g": 2,
                "sugar_g": None,
                "sodium_mg": None,
            },
            _dom_nutrition(with_semantics).model_dump(),
        )

        rejected = (
            "Per porsi\nProtein\n3 gram",
            "Per porsi\nKalori\nsekitar 200 Kkal\nProtein\ntinggi",
            "Per porsi\nKalori\n181 Kkal\nIngredients\nProtein\n3 gram",
            "Per porsi\nKalori\n181 Kkal\nProtein\n3 gram\nPer serving",
        )
        for text in rejected:
            with self.subTest(text=text):
                self.assertIsNone(_dom_nutrition(text))

    def test_matches_only_exact_normalized_indonesian_dom_headings(self):
        template = """
        <article>
          <h1>Sup</h1>
          <h2>{ingredients}</h2><ul><li>1 cup water</li></ul>
          <h2>{instructions}</h2><ol><li>Aduk rata.</li></ol>
        </article>
        """
        ingredient_headings = ("Bahan", "Bahan-Bahan")
        instruction_headings = (
            "Cara Membuat",
            "Cara Memasak",
            "Langkah",
            "Langkah-Langkah",
        )

        for heading in ingredient_headings:
            with self.subTest(ingredient_heading=heading):
                text = extract_recipe_container_text(
                    template.format(
                        ingredients=heading,
                        instructions="Cara Membuat",
                    ),
                    max_chars=20_000,
                )
                self.assertIn(heading, text)

        for heading in instruction_headings:
            with self.subTest(instruction_heading=heading):
                text = extract_recipe_container_text(
                    template.format(ingredients="Bahan", instructions=heading),
                    max_chars=20_000,
                )
                self.assertIn(heading, text)

        normalized = extract_recipe_container_text(
            template.format(
                ingredients="  BAHAN -   BAHAN : ",
                instructions=" CARA   MEMBUAT : ",
            ),
            max_chars=20_000,
        )
        self.assertEqual("Sup", parse_recipe_text(normalized).title)

        for ingredients, instructions in (
            ("Bahan Tambahan", "Cara Membuat"),
            ("Bahan", "Cara Membuat Saus"),
        ):
            with self.subTest(
                ingredients=ingredients,
                instructions=instructions,
            ):
                with self.assertRaises(WebsiteImportError) as caught:
                    extract_recipe_container_text(
                        template.format(
                            ingredients=ingredients,
                            instructions=instructions,
                        ),
                        max_chars=20_000,
                    )
                self.assertEqual("recipe_not_found", caught.exception.detail)

    def test_supports_semantic_headings_groups_metadata_and_nested_roots(self):
        html = """
        <main>
          <article id="recipe-card">
            <div class="sidebar">
              <h2>Ingredients</h2><p>Advertisement</p>
              <h2>Method</h2><p>Buy something.</p>
            </div>
            <div role="navigation">Previous recipe | Next recipe</div>
            <h1>Weeknight Soup</h1>
            <p>Prep time: 5 mins</p>
            <h2>Ingredients</h2>
            <h3>Broth</h3>
            <ul><li>1 cup water</li><li>1 pinch salt</li></ul>
            <h2>Directions</h2>
            <ol><li>Stir well.</li><li>Serve warm.</li></ol>
            <p>Keep covered.<br>Refrigerate leftovers.</p>
          </article>
        </main>
        """
        draft = parse_recipe_text(
            extract_recipe_container_text(html, max_chars=20_000)
        )

        self.assertEqual("Weeknight Soup", draft.title)
        self.assertEqual(5, draft.prep_time_minutes)
        self.assertEqual("Broth", draft.ingredients[0].title)
        self.assertEqual(4, len(draft.instructions[0].steps))

    def test_rejects_ambiguous_incomplete_hidden_and_untitled_candidates(self):
        complete = """
          <article>
            <h1>{title}</h1>
            <h2>Ingredients</h2><ul><li>1 cup water</li></ul>
            <h2>Method</h2><ol><li>Stir.</li></ol>
          </article>
        """
        cases = {
            "ambiguous": f"<main>{complete.format(title='One')}{complete.format(title='Two')}</main>",
            "ingredients only": "<article><h1>Soup</h1><h2>Ingredients</h2><ul><li>water</li></ul></article>",
            "instructions only": "<article><h1>Soup</h1><h2>Method</h2><p>Stir.</p></article>",
            "hidden method": "<article><h1>Soup</h1><h2>Ingredients</h2><ul><li>water</li></ul><div hidden><h2>Method</h2><p>Stir.</p></div></article>",
            "untitled": "<article><h2>Ingredients</h2><ul><li>water</li></ul><h2>Method</h2><p>Stir.</p></article>",
        }
        for name, html in cases.items():
            with self.subTest(name=name):
                with self.assertRaises(WebsiteImportError) as caught:
                    extract_recipe_container_text(html, max_chars=20_000)
                self.assertEqual("recipe_not_found", caught.exception.detail)

    def test_enforces_length_without_truncating(self):
        template = """
        <article>
          <h1>Soup</h1>
          <p>{filler}</p>
          <h2>Ingredients</h2><ul><li>1 cup water</li></ul>
          <h2>Method</h2><ol><li>Stir well.</li></ol>
        </article>
        """
        one_character = extract_recipe_container_text(
            template.format(filler="x"),
            max_chars=20_000,
        )
        fixed_length = len(one_character) - 1
        at_limit_html = template.format(filler="x" * (20_000 - fixed_length))
        over_limit_html = template.format(filler="x" * (20_001 - fixed_length))

        self.assertEqual(
            20_000,
            len(extract_recipe_container_text(at_limit_html, max_chars=20_000)),
        )
        with self.assertRaises(WebsiteImportError):
            extract_recipe_container_text(over_limit_html, max_chars=20_000)


class UrlSafetyTest(unittest.TestCase):
    def test_transport_diagnostics_reject_unallowlisted_text(self):
        error = WebsiteImportError(
            "page_unavailable",
            hostname="example.com\nsecret",
            fetch_phase="raw exception",
            content_type="text/html\nsecret",
            transport_error_kind="socket exploded",
        )

        self.assertIsNone(error.hostname)
        self.assertIsNone(error.fetch_phase)
        self.assertIsNone(error.content_type)
        self.assertIsNone(error.transport_error_kind)

    def assert_unsafe(self, url, answers=None):
        answers = answers if answers is not None else PUBLIC_ANSWER
        with patch("server.recipe_url_import.socket.getaddrinfo", return_value=answers):
            with self.assertRaises(WebsiteImportError) as caught:
                _validated_target(url)
        self.assertEqual("unsafe_url", caught.exception.detail)

    def test_rejects_malformed_credentials_scheme_and_port(self):
        for url in (
            "not a url",
            "https://user:pass@example.com/recipe",
            "file:///etc/passwd",
            "https://example.com:8080/recipe",
        ):
            with self.subTest(url=url):
                self.assert_unsafe(url)

    def test_rejects_non_global_addresses(self):
        for address in (
            "127.0.0.1",
            "10.0.0.1",
            "169.254.10.1",
            "::1",
            "fc00::1",
            "fe80::1",
        ):
            family = socket.AF_INET6 if ":" in address else socket.AF_INET
            with self.subTest(address=address):
                self.assert_unsafe(
                    "https://example.com/recipe",
                    [(family, socket.SOCK_STREAM, 6, "", (address, 443))],
                )

    def test_rejects_mixed_public_and_private_dns_answers(self):
        self.assert_unsafe(
            "https://example.com/recipe",
            PUBLIC_ANSWER
            + [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.2", 443))],
        )


class SafeFetchTest(unittest.TestCase):
    def fetch_with_pool(self, pool, url="https://example.com/recipe"):
        with (
            patch("server.recipe_url_import.socket.getaddrinfo", return_value=PUBLIC_ANSWER),
            patch("server.recipe_url_import.urllib3.HTTPSConnectionPool", return_value=pool) as factory,
        ):
            page = fetch_public_html(url, transport="urllib3")
        return page, factory

    def fetch_image_with_pool(self, pool, url="https://example.com/photo.jpg"):
        with (
            patch("server.recipe_url_import.socket.getaddrinfo", return_value=PUBLIC_ANSWER),
            patch("server.recipe_url_import.urllib3.HTTPSConnectionPool", return_value=pool) as factory,
        ):
            image = fetch_public_image(url)
        return image, factory

    def test_connects_to_verified_ip_and_preserves_tls_hostname(self):
        pool = FakePool(FakeResponse(chunks=[b"<html>ok</html>"]))
        page, factory = self.fetch_with_pool(pool)

        self.assertEqual("93.184.216.34", factory.call_args.args[0])
        self.assertEqual("example.com", factory.call_args.kwargs["server_hostname"])
        self.assertEqual("example.com", factory.call_args.kwargs["assert_hostname"])
        self.assertEqual("example.com", pool.calls[0][1]["headers"]["Host"])
        self.assertEqual("/recipe", pool.calls[0][0][1])
        self.assertEqual("<html>ok</html>", page.html)
        self.assertEqual(
            HTML_USER_AGENT,
            pool.calls[0][1]["headers"]["User-Agent"],
        )

    def test_follows_safe_redirect_and_revalidates_hostname(self):
        first = FakePool(FakeResponse(302, {"Location": "https://next.example/food"}))
        second = FakePool(FakeResponse(chunks=[b"done"]))
        answers = [PUBLIC_ANSWER, PUBLIC_ANSWER]
        with (
            patch("server.recipe_url_import.socket.getaddrinfo", side_effect=answers) as resolve,
            patch("server.recipe_url_import.urllib3.HTTPSConnectionPool", side_effect=[first, second]),
        ):
            page = fetch_public_html(
                "https://example.com/recipe",
                transport="urllib3",
            )

        self.assertEqual(2, resolve.call_count)
        self.assertEqual("https://next.example/food", page.url)

    def test_rejects_unsafe_redirect(self):
        first = FakePool(FakeResponse(302, {"Location": "http://127.0.0.1/admin"}))
        with (
            patch("server.recipe_url_import.socket.getaddrinfo", side_effect=[PUBLIC_ANSWER, [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80)),
            ]]),
            patch("server.recipe_url_import.urllib3.HTTPSConnectionPool", return_value=first),
        ):
            with self.assertRaises(WebsiteImportError) as caught:
                fetch_public_html(
                    "https://example.com/recipe",
                    transport="urllib3",
                )
        self.assertEqual("unsafe_url", caught.exception.detail)

    def test_rejects_redirect_limit(self):
        pools = [
            FakePool(FakeResponse(302, {"Location": f"/recipe/{index}"}))
            for index in range(4)
        ]
        with (
            patch("server.recipe_url_import.socket.getaddrinfo", return_value=PUBLIC_ANSWER),
            patch("server.recipe_url_import.urllib3.HTTPSConnectionPool", side_effect=pools),
        ):
            with self.assertRaises(WebsiteImportError) as caught:
                fetch_public_html(
                    "https://example.com/recipe",
                    transport="urllib3",
                )
        self.assertEqual("page_unavailable", caught.exception.detail)

    def test_maps_timeout_and_remote_error(self):
        timeout = urllib3.exceptions.ReadTimeoutError(None, "/", "timed out")
        for pool, expected in (
            (FakePool(error=timeout), "fetch_timeout"),
            (FakePool(FakeResponse(status=500)), "page_unavailable"),
        ):
            with self.subTest(expected=expected):
                with self.assertRaises(WebsiteImportError) as caught:
                    self.fetch_with_pool(pool)
                self.assertEqual(expected, caught.exception.detail)
                self.assertEqual("example.com", caught.exception.hostname)
                self.assertEqual(
                    "timeout" if expected == "fetch_timeout" else "http_error",
                    caught.exception.transport_error_kind,
                )

    def test_non_retryable_http_response_stops_address_traversal(self):
        answers = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.35", 443)),
        ]
        first = FakePool(FakeResponse(status=403))
        second = FakePool()
        with patch(
            "server.recipe_url_import.socket.getaddrinfo",
            return_value=answers,
        ), patch(
            "server.recipe_url_import.urllib3.HTTPSConnectionPool",
            side_effect=[first, second],
        ) as factory, self.assertRaises(WebsiteImportError) as caught:
            fetch_public_html(
                "https://example.com/recipe",
                transport="urllib3",
            )

        self.assertEqual(403, caught.exception.upstream_status)
        self.assertEqual("response", caught.exception.fetch_phase)
        self.assertEqual("http_error", caught.exception.transport_error_kind)
        self.assertEqual(1, factory.call_count)

    def test_retryable_http_response_stops_current_round_then_retries(self):
        answers = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.35", 443)),
        ]
        for status in (429, 500, 502, 503, 504):
            first = FakePool(FakeResponse(status=status))
            success = FakePool(FakeResponse(chunks=[b"ok"]))
            with self.subTest(status=status), patch(
                "server.recipe_url_import.socket.getaddrinfo",
                return_value=answers,
            ) as resolve, patch(
                "server.recipe_url_import.urllib3.HTTPSConnectionPool",
                side_effect=[first, success],
            ) as factory, patch(
                "server.recipe_url_import.sleep"
            ):
                page = fetch_public_html(
                    "https://example.com/recipe",
                    transport="urllib3",
                )

            self.assertEqual("ok", page.html)
            self.assertEqual(2, resolve.call_count)
            self.assertEqual(2, factory.call_count)
            self.assertEqual(2, page.request_round_count)
            self.assertEqual(2, page.address_attempt_count)
            self.assertEqual(f"http_{status}", page.retry_reason)

    def test_tries_another_address_only_after_connection_failure(self):
        answers = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.35", 443)),
        ]
        failed_connection = FakePool(
            error=urllib3.exceptions.NewConnectionError(None, "refused")
        )
        success = FakePool(FakeResponse(chunks=[b"ok"]))
        with patch(
            "server.recipe_url_import.socket.getaddrinfo",
            return_value=answers,
        ), patch(
            "server.recipe_url_import.urllib3.HTTPSConnectionPool",
            side_effect=[failed_connection, success],
        ) as factory:
            page = fetch_public_html(
                "https://example.com/recipe",
                transport="urllib3",
            )

        self.assertEqual("ok", page.html)
        self.assertEqual(2, factory.call_count)

        partial_read = FakePool(PartialReadResponse())
        with patch(
            "server.recipe_url_import.socket.getaddrinfo",
            return_value=answers,
        ) as resolve, patch(
            "server.recipe_url_import.urllib3.HTTPSConnectionPool",
            side_effect=[partial_read, success],
        ) as factory, patch("server.recipe_url_import.sleep"):
            page = fetch_public_html(
                "https://example.com/recipe",
                transport="urllib3",
            )

        self.assertEqual("ok", page.html)
        self.assertEqual(2, page.response_size)
        self.assertEqual(2, page.request_round_count)
        self.assertEqual(2, page.address_attempt_count)
        self.assertEqual("read_failure", page.retry_reason)
        self.assertEqual(2, resolve.call_count)
        self.assertEqual(2, factory.call_count)

    def test_curl_profile_resolve_and_request_safety_options(self):
        assert_html_browser_profile_supported()
        self.assertEqual(
            "example.com:443:[2001:4860:4860::8888]",
            _curl_resolve_rule("example.com", 443, "2001:4860:4860::8888"),
        )

        session = MagicMock()
        client = session.__enter__.return_value

        def get(_url, **kwargs):
            kwargs["content_callback"](b"<html>ok</html>")
            return Mock(
                status_code=200,
                headers={"Content-Type": "text/html; charset=utf-8"},
            )

        client.get.side_effect = get
        with patch(
            "server.recipe_url_import.socket.getaddrinfo",
            return_value=PUBLIC_ANSWER,
        ), patch(
            "server.recipe_url_import.curl_requests.Session",
            return_value=session,
        ) as session_factory:
            page = fetch_public_html(
                "https://example.com/recipe",
                transport="curl_cffi",
            )

        options = session_factory.call_args.kwargs
        self.assertFalse(options["trust_env"])
        self.assertFalse(options["allow_redirects"])
        self.assertEqual(0, options["retry"])
        self.assertEqual(HTML_BROWSER_PROFILE, options["impersonate"])
        self.assertTrue(options["default_headers"])
        self.assertEqual(
            ["example.com:443:93.184.216.34"],
            options["curl_options"][CurlOpt.RESOLVE],
        )
        self.assertEqual(
            MAX_HTML_BYTES,
            options["curl_options"][CurlOpt.MAXFILESIZE_LARGE],
        )
        request = client.get.call_args
        self.assertEqual("https://example.com/recipe", request.args[0])
        self.assertFalse(request.kwargs["allow_redirects"])
        self.assertTrue(request.kwargs["discard_cookies"])
        self.assertNotIn("Host", request.kwargs["headers"])
        self.assertEqual("curl_cffi", page.transport)
        self.assertEqual(HTML_BROWSER_PROFILE, page.browser_profile)

    def test_browser_profile_validation_is_strictly_local(self):
        with patch.object(Curl, "perform") as perform, patch(
            "server.recipe_url_import.socket.getaddrinfo"
        ) as resolve, patch(
            "server.recipe_url_import.curl_requests.Session"
        ) as session:
            assert_html_browser_profile_supported()

        perform.assert_not_called()
        resolve.assert_not_called()
        session.assert_not_called()

    def test_curl_retry_discards_partial_response_body(self):
        first_session = MagicMock()
        first_client = first_session.__enter__.return_value

        def fail_during_body(_url, **kwargs):
            kwargs["content_callback"](b"discard me")
            response = Mock(status_code=200, headers={"Content-Type": "text/html"})
            raise curl_requests.exceptions.Timeout(
                "timed out",
                CurlECode.OPERATION_TIMEDOUT,
                response,
            )

        first_client.get.side_effect = fail_during_body
        second_session = MagicMock()
        second_client = second_session.__enter__.return_value

        def succeed(_url, **kwargs):
            kwargs["content_callback"](b"kept")
            return Mock(
                status_code=200,
                headers={"Content-Type": "text/html; charset=utf-8"},
            )

        second_client.get.side_effect = succeed
        with patch(
            "server.recipe_url_import.settings.recipe_html_transport",
            "curl_cffi",
        ), patch(
            "server.recipe_url_import.socket.getaddrinfo",
            return_value=PUBLIC_ANSWER,
        ) as resolve, patch(
            "server.recipe_url_import.curl_requests.Session",
            side_effect=[first_session, second_session],
        ), patch("server.recipe_url_import.sleep"):
            page = fetch_public_html("https://example.com/recipe")

        self.assertEqual("kept", page.html)
        self.assertEqual(4, page.response_size)
        self.assertEqual(2, page.request_round_count)
        self.assertEqual(2, page.address_attempt_count)
        self.assertEqual("read_failure", page.retry_reason)
        self.assertEqual(2, resolve.call_count)

    def test_retryable_second_http_response_is_final(self):
        first = FakePool(FakeResponse(status=503))
        second = FakePool(FakeResponse(status=503))
        unused = FakePool()
        with patch(
            "server.recipe_url_import.socket.getaddrinfo",
            return_value=PUBLIC_ANSWER,
        ) as resolve, patch(
            "server.recipe_url_import.urllib3.HTTPSConnectionPool",
            side_effect=[first, second, unused],
        ) as factory, patch(
            "server.recipe_url_import.sleep"
        ), self.assertRaises(WebsiteImportError) as caught:
            fetch_public_html(
                "https://example.com/recipe",
                transport="urllib3",
            )

        self.assertEqual(503, caught.exception.upstream_status)
        self.assertEqual(2, caught.exception.request_round_count)
        self.assertEqual(2, caught.exception.address_attempt_count)
        self.assertEqual("http_503", caught.exception.retry_reason)
        self.assertEqual(2, resolve.call_count)
        self.assertEqual(2, factory.call_count)

    def test_retry_after_is_bounded_and_supports_http_dates(self):
        with patch("server.recipe_url_import.uniform", return_value=0.2):
            self.assertEqual(0.2, _retry_delay(429, {}))
            self.assertEqual(0.2, _retry_delay(429, {"Retry-After": "invalid"}))
            self.assertEqual(0.2, _retry_delay(429, {"Retry-After": "²"}))
        self.assertEqual(0, _retry_delay(429, {"Retry-After": "0"}))
        self.assertIsNone(_retry_delay(429, {"Retry-After": "2"}))
        self.assertEqual(
            0,
            _retry_delay(
                429,
                {"Retry-After": format_datetime(datetime.now(timezone.utc))},
            ),
        )

    def test_curl_rejects_compressed_decoded_body_over_limit(self):
        decoded = b"x" * (MAX_HTML_BYTES + 1)
        encoded_bodies = {
            "gzip": gzip.compress(decoded),
            "br": bytes.fromhex("9b000030f825f0e2b14040f7fe05"),
        }

        for encoding, body in encoded_bodies.items():
            with self.subTest(encoding=encoding):
                class Handler(BaseHTTPRequestHandler):
                    def do_GET(self):
                        self.send_response(200)
                        self.send_header("Content-Type", "text/html")
                        self.send_header("Content-Encoding", encoding)
                        self.send_header("Content-Length", str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)

                    def log_message(self, *_args):
                        pass

                server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    port = server.server_address[1]
                    parsed = urlsplit(f"http://fixture.test:{port}/recipe")
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")
                        with self.assertRaises(WebsiteImportError) as caught:
                            _fetch_html_from_address(
                                parsed,
                                "127.0.0.1",
                                port,
                                monotonic() + 5,
                                "text/html, application/xhtml+xml",
                                MAX_HTML_BYTES,
                            )
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join()

                self.assertEqual("page_too_large", caught.exception.detail)
                self.assertGreater(caught.exception.response_size, MAX_HTML_BYTES)

    def test_rejects_missing_or_incompatible_content_type(self):
        for headers in ({}, {"Content-Type": "application/pdf"}):
            response = FakeResponse(headers={"x": "y"} if not headers else headers)
            with self.subTest(headers=headers):
                with self.assertRaises(WebsiteImportError) as caught:
                    self.fetch_with_pool(FakePool(response))
                self.assertEqual("unsupported_content_type", caught.exception.detail)

    def test_rejects_declared_and_streamed_oversize_bodies(self):
        cases = (
            FakeResponse(headers={
                "Content-Type": "text/html",
                "Content-Length": str(MAX_HTML_BYTES + 1),
            }),
            FakeResponse(chunks=[b"x" * MAX_HTML_BYTES, b"x"]),
        )
        for response in cases:
            with self.subTest(headers=response.headers):
                with self.assertRaises(WebsiteImportError) as caught:
                    self.fetch_with_pool(FakePool(response))
                self.assertEqual("page_too_large", caught.exception.detail)

    def test_decodes_declared_charset(self):
        response = FakeResponse(
            headers={"Content-Type": "text/html; charset=iso-8859-1"},
            chunks=["café".encode("iso-8859-1")],
        )
        page, _factory = self.fetch_with_pool(FakePool(response))
        self.assertEqual("café", page.html)

    def test_fetches_supported_image_from_verified_ip(self):
        pool = FakePool(FakeResponse(
            headers={"Content-Type": "image/webp"},
            chunks=[b"image-bytes"],
        ))
        image, factory = self.fetch_image_with_pool(pool)

        self.assertEqual(b"image-bytes", image.body)
        self.assertEqual("image/webp", image.content_type)
        self.assertEqual("93.184.216.34", factory.call_args.args[0])
        self.assertEqual("example.com", factory.call_args.kwargs["server_hostname"])
        self.assertEqual(
            "image/jpeg, image/png, image/webp",
            pool.calls[0][1]["headers"]["Accept"],
        )
        self.assertEqual(
            "NoomoriRecipeImport/1.0",
            pool.calls[0][1]["headers"]["User-Agent"],
        )

    def test_rejects_unsupported_and_oversize_images(self):
        cases = (
            (FakeResponse(headers={"Content-Type": "image/gif"}), "unsupported_content_type"),
            (FakeResponse(headers={
                "Content-Type": "image/jpeg",
                "Content-Length": str(MAX_IMAGE_BYTES + 1),
            }), "page_too_large"),
            (FakeResponse(
                headers={"Content-Type": "image/png"},
                chunks=[b"x" * MAX_IMAGE_BYTES, b"x"],
            ), "page_too_large"),
        )
        for response, expected in cases:
            with self.subTest(expected=expected):
                with self.assertRaises(WebsiteImportError) as caught:
                    self.fetch_image_with_pool(FakePool(response))
                self.assertEqual(expected, caught.exception.detail)


class ImportRecipeUrlEndpointTest(unittest.TestCase):
    def test_fallback_preserves_labeled_metadata_without_publisher_prose(self):
        page = FetchedRecipePage("html", "https://example.com/soup", "example.com", 4)
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch("server.modules.recipes.imports.website.extract_recipe", side_effect=WebsiteImportError("recipe_not_found")),
            patch("server.modules.recipes.imports.website.extract_recipe_container_text", return_value=(
                "Soup\nPublisher introduction.\nTotal: 5 min\nTotal: 10 min\n"
                "Yield: 1 jar\nIngredients\n1 cup water"
            )),
        ):
            draft = import_recipe_url(ImportRecipeUrlRequest(url=page.url), _auth=Mock())
        self.assertEqual("Total: 5 min\nTotal: 10 min\nYield: 1 jar", draft.description)
        self.assertIsNone(draft.total_time_minutes)

    def test_partial_primary_does_not_bypass_fallback_security_or_ambiguity_errors(self):
        page = FetchedRecipePage("html", "https://example.com/soup", "example.com", 4)
        for error in (WebsiteImportError("unsafe_url"), RecipeTextImportError("multiple_recipes"),
                      RecipeTextImportError("ambiguous_structure")):
            with (
                self.subTest(error=error),
                patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
                patch("server.modules.recipes.imports.website.extract_recipe", return_value=extracted_recipe(instructions=[])),
                patch("server.modules.recipes.imports.website.extract_recipe_container_text", side_effect=error),
            ):
                with self.assertRaises(HTTPException):
                    import_recipe_url(ImportRecipeUrlRequest(url=page.url), _auth=Mock())

    def test_retains_useful_primary_when_fallback_fails_or_is_partial(self):
        page = FetchedRecipePage("html", "https://example.com/soup", "example.com", 4)
        for primary in (extracted_recipe(instructions=[]), extracted_recipe(ingredient_groups=[])):
            for fallback in (WebsiteImportError("recipe_not_found"), ValueError("unusable"),
                             RuntimeError("extractor failure"),
                             "Other Soup\nIngredients\n1 cup water"):
                with self.subTest(primary=primary, fallback=fallback):
                    effect = ({"side_effect": fallback} if isinstance(fallback, Exception)
                              else {"return_value": fallback})
                    with (
                        patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
                        patch("server.modules.recipes.imports.website.extract_recipe", return_value=primary),
                        patch("server.modules.recipes.imports.website.extract_recipe_container_text", **effect),
                    ):
                        draft = import_recipe_url(ImportRecipeUrlRequest(url=page.url), _auth=Mock())
                    self.assertEqual(normalize_imported_website_recipe(primary), draft)

    def test_accepts_partial_fallback_without_useful_primary(self):
        page = FetchedRecipePage("html", "https://example.com/soup", "example.com", 4)
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch("server.modules.recipes.imports.website.extract_recipe", side_effect=WebsiteImportError("recipe_not_found")),
            patch("server.modules.recipes.imports.website.extract_recipe_container_text", return_value="Soup\nIngredients\n1 cup water"),
        ):
            draft = import_recipe_url(ImportRecipeUrlRequest(url=page.url), _auth=Mock())
        self.assertEqual("Soup", draft.title)
        self.assertEqual([], draft.instructions)
        self.assertEqual("water", draft.ingredients[0].items[0].name)

    def test_endpoint_requires_authentication(self):
        route = next(
            route
            for route in recipe_router.routes
            if getattr(route, "path", None) == "/recipes/import/url"
        )
        dependency_calls = [dependency.call for dependency in route.dependant.dependencies]
        self.assertIn(get_current_user, dependency_calls)

    def test_response_contract_and_no_persistence(self):
        auth = AuthContext(user=Mock(), supabase=Mock())
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        with (
            patch(
                "server.modules.recipes.imports.website.fetch_public_html",
                return_value=page,
            ) as fetch_html,
            patch(
                "server.modules.recipes.imports.website.extract_recipe",
                return_value=extracted_recipe(
                    nutrients={
                        "servingSize": "1 bowl",
                        "calories": "120 kcal",
                        "proteinContent": "7 g",
                    }
                ),
            ),
            patch("server.modules.recipes.imports.website.extract_recipe_container_text") as fallback,
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url="https://example.com/recipe"),
                _auth=auth,
            )

        self.assertEqual("Soup", response.title)
        self.assertIn("ingredients", response.model_dump())
        self.assertEqual(120, response.nutrition_per_serving.calories_kcal)
        self.assertEqual(7, response.nutrition_per_serving.protein_g)
        fetch_html.assert_called_once_with("https://example.com/recipe")
        self.assertEqual([], auth.supabase.mock_calls)
        self.assertEqual(logging.INFO, log.call_args.args[0])
        self.assertEqual(
            ("recipe_scrapers", "none", "none", 0),
            log.call_args.args[-4:],
        )
        self.assertNotIn("exc_info", log.call_args.kwargs)
        fallback.assert_not_called()

    def test_falls_back_for_primary_exception_and_each_missing_core_field(self):
        auth = AuthContext(user=Mock(), supabase=Mock())
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        fallback_text = (
            "Soup\nPublisher introduction.\nIngredients\n- 1 cup water\n"
            "Method\n1. Stir well."
        )
        cases = (
            (
                WebsiteImportError("recipe_not_found"),
                "primary_exception",
            ),
            (extracted_recipe(instructions=[]), "primary_missing_instructions"),
            (
                extracted_recipe(ingredient_groups=[]),
                "primary_missing_ingredients",
            ),
            (
                extracted_recipe(ingredient_groups=[], instructions=[]),
                "primary_missing_both",
            ),
        )

        for primary_result, reason in cases:
            with self.subTest(reason=reason):
                extract_effect = (
                    {"side_effect": primary_result}
                    if isinstance(primary_result, Exception)
                    else {"return_value": primary_result}
                )
                with (
                    patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
                    patch("server.modules.recipes.imports.website.extract_recipe", **extract_effect),
                    patch(
                        "server.modules.recipes.imports.website.extract_recipe_container_text",
                        return_value=fallback_text,
                    ) as fallback,
                    patch("server.modules.recipes.imports.website.logger.log") as log,
                ):
                    response = import_recipe_url(
                        ImportRecipeUrlRequest(url="https://example.com/recipe"),
                        _auth=auth,
                    )

                self.assertEqual("Soup", response.title)
                self.assertEqual(1, len(response.ingredients[0].items))
                self.assertEqual("water", response.ingredients[0].items[0].name)
                self.assertEqual(1, len(response.instructions[0].steps))
                self.assertIsNone(response.description)
                self.assertEqual(
                    ("dom_fallback", reason, "none", 0),
                    log.call_args.args[-4:],
                )
                fallback.assert_called_once_with("html", max_chars=20_000)

    def test_fallback_preserves_primary_metadata_and_owns_core_fields(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        primary = extracted_recipe(
            title="Primary Soup",
            description="Primary description",
            ingredient_groups=[
                ExtractedIngredientGroup(None, ["1 cup primary stock"]),
            ],
            instructions=[],
            prep_time_minutes=10,
            cook_time_minutes=30,
            total_time_minutes=75,
            yield_text="4 servings",
            nutrients={
                "servingSize": "1 bowl",
                "calories": "120 kcal",
                "proteinContent": "7 g",
            },
            image_url="https://example.com/soup.webp",
        )
        fallback_text = """Fallback Soup
Servings: 2
Prep time: 5 minutes
Cook time: 15 minutes
Ingredients
- 2 cups water
Instructions
1. Boil the water.
"""

        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch(
                "server.modules.recipes.imports.website.extract_recipe_dom_metadata",
                return_value=ExtractedRecipeDomMetadata(
                    notes="Primary notes",
                    additional_time_label="Rest",
                    additional_time_text="35 min",
                ),
            ),
            patch("server.modules.recipes.imports.website.extract_recipe", return_value=primary),
            patch(
                "server.modules.recipes.imports.website.extract_recipe_container_text",
                return_value=fallback_text,
            ),
            patch("server.modules.recipes.imports.website._enrich_dom_nutrition") as dom_nutrition,
            patch("server.modules.recipes.imports.website.logger.log"),
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual("Fallback Soup", response.title)
        self.assertEqual("water", response.ingredients[0].items[0].name)
        self.assertEqual(
            "Boil the water.",
            response.instructions[0].steps[0].text,
        )
        self.assertEqual("Primary notes", response.description)
        self.assertEqual(4, response.servings)
        self.assertEqual(10, response.prep_time_minutes)
        self.assertEqual(30, response.cook_time_minutes)
        self.assertEqual(75, response.total_time_minutes)
        self.assertEqual("Rest", response.additional_time_label)
        self.assertEqual(35, response.additional_time_minutes)
        self.assertEqual(120, response.nutrition_per_serving.calories_kcal)
        self.assertEqual(7, response.nutrition_per_serving.protein_g)
        self.assertEqual(
            "https://example.com/soup.webp",
            str(response.image_url),
        )
        dom_nutrition.assert_not_called()

    def test_fallback_preserves_explicit_notes_with_non_serving_yield(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        primary = extracted_recipe(
            description="Publisher description",
            instructions=[],
            yield_text="1 large loaf",
        )
        fallback_text = (
            "Fallback Soup\nPublisher introduction.\nIngredients\n"
            "- 2 cups water\nInstructions\n1. Boil the water."
        )

        with (
            patch(
                "server.modules.recipes.imports.website.fetch_public_html",
                return_value=page,
            ),
            patch(
                "server.modules.recipes.imports.website.extract_recipe_dom_metadata",
                return_value=ExtractedRecipeDomMetadata(
                    notes="Keep refrigerated.",
                    additional_time_label=None,
                    additional_time_text=None,
                ),
            ),
            patch(
                "server.modules.recipes.imports.website.extract_recipe",
                return_value=primary,
            ),
            patch(
                "server.modules.recipes.imports.website.extract_recipe_container_text",
                return_value=fallback_text,
            ),
            patch("server.modules.recipes.imports.website.logger.log"),
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual(
            "Keep refrigerated.\nYield: 1 large loaf",
            response.description,
        )
        self.assertIsNone(response.servings)

    def test_fallback_preserves_total_when_primary_has_too_few_core_signals(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        primary = extracted_recipe(
            description=None,
            ingredient_groups=[],
            instructions=[],
            total_time_minutes=88,
        )
        fallback_text = (
            "Fallback Soup\nIngredients\n- 2 cups water\n"
            "Instructions\n1. Boil the water."
        )
        with patch(
            "server.modules.recipes.imports.website.fetch_public_html",
            return_value=page,
        ), patch(
            "server.modules.recipes.imports.website.extract_recipe",
            return_value=primary,
        ), patch(
            "server.modules.recipes.imports.website.extract_recipe_container_text",
            return_value=fallback_text,
        ), patch("server.modules.recipes.imports.website.logger.log"):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual("Fallback Soup", response.title)
        self.assertEqual(88, response.total_time_minutes)

    def test_realistic_unlisted_page_uses_dom_fallback_end_to_end(self):
        page = FetchedRecipePage(
            html=DOM_FIXTURE_PATH.read_text(),
            url="https://www.scottishgoatmeat.co.uk/mild-indian-goat-curry.html",
            hostname="www.scottishgoatmeat.co.uk",
            response_size=DOM_FIXTURE_PATH.stat().st_size,
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual("Mild Indian Goat Curry", response.title)
        self.assertEqual(4, len(response.ingredients[0].items))
        self.assertEqual(4, len(response.instructions[0].steps))
        self.assertIsNone(response.image_url)
        self.assertEqual(
            ("dom_fallback", "primary_exception", "none", 0),
            log.call_args.args[-4:],
        )

    def test_dapur_primary_applies_only_verified_ingredient_groups(self):
        page = FetchedRecipePage(
            html=DAPUR_FIXTURE_PATH.read_text(),
            url="https://www.dapurumami.com/resep/spring-roll-sayur-ala-saori",
            hostname="www.dapurumami.com",
            response_size=DAPUR_FIXTURE_PATH.stat().st_size,
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual("Spring Roll Sayur ala SAORI", response.title)
        self.assertEqual(4, response.servings)
        self.assertEqual(40, response.cook_time_minutes)
        self.assertEqual(
            [("Bahan Utama", 2), ("Bahan Isi", 2)],
            [(group.title, len(group.items)) for group in response.ingredients],
        )
        self.assertEqual(1, len(response.instructions))
        self.assertIsNone(response.instructions[0].title)
        self.assertEqual(5, len(response.instructions[0].steps))
        self.assertEqual(576, response.nutrition_per_serving.calories_kcal)
        self.assertEqual(5.8, response.nutrition_per_serving.protein_g)
        self.assertEqual(102.5, response.nutrition_per_serving.carbs_g)
        self.assertEqual(14.8, response.nutrition_per_serving.fat_g)
        self.assertEqual(1.5, response.nutrition_per_serving.fiber_g)
        self.assertEqual(
            ("recipe_scrapers", "none", "none", 0),
            log.call_args.args[-4:],
        )

    def test_enriches_flat_primary_with_verified_serious_eats_groups(self):
        html = SERIOUS_EATS_FIXTURE_PATH.read_text()
        url = "https://www.seriouseats.com/chicken-pot-pie-biscuit-topping-recipe"
        page = FetchedRecipePage(
            html=html,
            url=url,
            hostname="www.seriouseats.com",
            response_size=len(html.encode()),
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page) as fetch,
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=url),
                _auth=Mock(),
            )

        self.assertEqual(20, response.prep_time_minutes)
        self.assertEqual(140, response.cook_time_minutes)
        self.assertEqual(6, response.servings)
        self.assertEqual(1014, response.nutrition_per_serving.calories_kcal)
        self.assertEqual(
            "https://images.example.com/chicken-pot-pie.jpg",
            str(response.image_url),
        )
        self.assertEqual(
            ["For the Chicken", "For the Filling", "For the Biscuit Topping"],
            [group.title for group in response.ingredients],
        )
        self.assertEqual(
            [10, 16, 6],
            [len(group.items) for group in response.ingredients],
        )
        self.assertEqual(
            ["For the Chicken", "For the Filling", "For Biscuit Topping"],
            [group.title for group in response.instructions],
        )
        self.assertEqual(
            [2, 3, 2],
            [len(group.steps) for group in response.instructions],
        )
        self.assertEqual(
            "Combine the chicken, stock, vegetables, and herbs.",
            response.instructions[0].steps[0].text,
        )
        self.assertEqual("dom", log.call_args.args[-5])
        self.assertEqual(
            ("recipe_scrapers", "none", "none", 0),
            log.call_args.args[-4:],
        )
        fetch.assert_called_once_with(url)

    def test_enriches_simply_recipes_primary_with_nested_instruction_labels(self):
        html = SIMPLY_RECIPES_FIXTURE_PATH.read_text()
        url = "https://www.simplyrecipes.com/recipes/pumpkin_bread/"
        page = FetchedRecipePage(
            html=html,
            url=url,
            hostname="www.simplyrecipes.com",
            response_size=len(html.encode()),
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=url),
                _auth=Mock(),
            )

        self.assertEqual(8, response.servings)
        self.assertEqual(15, response.prep_time_minutes)
        self.assertEqual(45, response.cook_time_minutes)
        self.assertEqual(259, response.nutrition_per_serving.calories_kcal)
        self.assertEqual(
            ["For the pumpkin bread", "For the orange glaze (optional)"],
            [group.title for group in response.ingredients],
        )
        self.assertEqual(
            [
                "Make the homemade pumpkin purée (optional)",
                "Preheat oven to 350°F (180°C)",
                "Whisk the dry ingredients",
                "Combine the wet ingredients",
                "Make the batter",
                "Bake",
                "Remove from pan and cool completely",
                "Glaze",
            ],
            [group.title for group in response.instructions],
        )
        self.assertEqual(
            [1, 1, 1, 1, 1, 1, 1, 2],
            [len(group.steps) for group in response.instructions],
        )
        self.assertEqual(
            "Cut and roast the pumpkin. Cool it, then scoop out the flesh.",
            response.instructions[0].steps[0].text,
        )
        self.assertEqual(
            "Cool briefly in the pan. Transfer the loaf to a rack.",
            response.instructions[6].steps[0].text,
        )
        self.assertEqual("Enjoy!", response.instructions[-1].steps[-1].text)
        self.assertEqual("dom", log.call_args.args[-5])
        self.assertEqual(
            ("recipe_scrapers", "none", "none", 0),
            log.call_args.args[-4:],
        )

    def test_simply_recipes_dom_fallback_preserves_nested_instruction_labels(self):
        html = SIMPLY_RECIPES_FIXTURE_PATH.read_text()
        page = FetchedRecipePage(
            html=html,
            url="https://www.simplyrecipes.com/recipes/pumpkin_bread/",
            hostname="www.simplyrecipes.com",
            response_size=len(html.encode()),
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch(
                "server.modules.recipes.imports.website.extract_recipe",
                side_effect=WebsiteImportError("recipe_not_found"),
            ),
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual(8, len(response.instructions))
        self.assertEqual(9, sum(len(group.steps) for group in response.instructions))
        self.assertEqual(
            "Make the homemade pumpkin purée (optional)",
            response.instructions[0].title,
        )
        self.assertEqual("Enjoy!", response.instructions[-1].steps[-1].text)
        self.assertEqual(
            ("dom_fallback", "primary_exception", "none", 0),
            log.call_args.args[-4:],
        )

    def test_group_enrichment_verifies_each_dimension_independently(self):
        html = SERIOUS_EATS_FIXTURE_PATH.read_text()
        url = "https://www.seriouseats.com/chicken-pot-pie-biscuit-topping-recipe"
        extracted = extract_recipe(html, url)
        draft = normalize_imported_website_recipe(extracted)
        mismatches = (
            html.replace(
                "<li>1 bay leaf</li>",
                "",
                1,
            ),
            html.replace(
                "<li>1 sprig parsley</li>\n              <li>1 sprig rosemary</li>",
                "<li>1 sprig rosemary</li>\n              <li>1 sprig parsley</li>",
                1,
            ),
            html.replace(
                "<li>1 bay leaf</li>",
                "<li>1 bay leaf.</li>",
                1,
            ),
            html.replace(
                "<strong>For the Filling:</strong>",
                "<strong>Filling:</strong>",
                1,
            ),
        )

        for index, candidate in enumerate(mismatches):
            with self.subTest(index=index):
                result, enriched = _enrich_primary_groups(
                    draft,
                    extracted,
                    candidate,
                )
                self.assertTrue(enriched)
                if index < 3:
                    self.assertEqual(
                        [None],
                        [group.title for group in result.ingredients],
                    )
                    self.assertGreater(len(result.instructions), 1)
                else:
                    self.assertGreater(len(result.ingredients), 1)
                    self.assertEqual(
                        [None],
                        [group.title for group in result.instructions],
                    )

    def test_group_enrichment_rejects_unsafe_or_unverified_label_rows(self):
        fixture = COOKPAD_FIXTURE_PATH.read_text()
        list_block = """<li>1 tbsp oil</li>
        <li class="font-semibold"><span>Spice Mix:</span></li>
        <li>1 tsp paprika</li>
        <li>1 tsp garlic powder</li>"""
        label_last = """<li>1 tbsp oil</li>
        <li>1 tsp paprika</li>
        <li>1 tsp garlic powder</li>
        <li class="font-semibold"><span>Spice Mix:</span></li>"""
        cases = (
            fixture.replace("Spice Mix:", "2 Spice Mix:"),
            fixture.replace("Spice Mix:", "cup Mix:"),
            fixture.replace(list_block, label_last),
            fixture.replace('"Spice Mix:",', '"Spice Blend:",', 1),
        )

        for index, html in enumerate(cases):
            with self.subTest(index=index):
                extracted = extract_recipe(
                    html,
                    "https://example.com/weeknight-noodles",
                )
                draft = normalize_imported_website_recipe(extracted)
                result, enriched = _enrich_primary_groups(
                    draft,
                    extracted,
                    html,
                )

                self.assertFalse(enriched)
                self.assertEqual(
                    [None],
                    [group.title for group in result.ingredients],
                )
                self.assertEqual(5, len(result.ingredients[0].items))

    def test_group_enrichment_never_overwrites_native_groups(self):
        html = SERIOUS_EATS_FIXTURE_PATH.read_text()
        url = "https://www.seriouseats.com/chicken-pot-pie-biscuit-topping-recipe"
        extracted = extract_recipe(html, url)
        native = ExtractedRecipe(
            title=extracted.title,
            description=extracted.description,
            ingredient_groups=[
                ExtractedIngredientGroup(
                    "Native Group",
                    extracted.ingredient_groups[0].ingredients,
                )
            ],
            instructions=extracted.instructions,
            prep_time_minutes=extracted.prep_time_minutes,
            cook_time_minutes=extracted.cook_time_minutes,
            yield_text=extracted.yield_text,
            nutrients=extracted.nutrients,
            image_url=extracted.image_url,
        )
        draft = normalize_imported_website_recipe(native)

        result, enriched = _enrich_primary_groups(draft, native, html)

        self.assertTrue(enriched)
        self.assertEqual("Native Group", result.ingredients[0].title)
        self.assertGreater(len(result.instructions), 1)

    def test_group_enrichment_failure_keeps_complete_primary_import(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch("server.modules.recipes.imports.website.extract_recipe", return_value=extracted_recipe()),
            patch(
                "server.modules.recipes.imports.website._enrich_primary_groups",
                side_effect=RuntimeError("bad optional DOM structure"),
            ),
            patch("server.modules.recipes.imports.website.extract_recipe_container_text") as nutrition_dom,
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual("Soup", response.title)
        self.assertEqual("Soup", response.ingredients[0].title)
        self.assertEqual("none", log.call_args.args[-5])
        nutrition_dom.assert_called_once_with("html", max_chars=20_000)

    def test_enriches_missing_primary_nutrition_with_explicit_dom_semantics(self):
        html = DAPUR_FIXTURE_PATH.read_text().replace(
            "<!-- nutrition-marker -->",
            "<h2>Informasi Nilai Gizi per Porsi</h2>",
        )
        url = "https://www.dapurumami.com/resep/spring-roll-sayur-ala-saori"
        primary = replace(extract_recipe(html, url), nutrients={})
        page = FetchedRecipePage(
            html=html,
            url=url,
            hostname="www.dapurumami.com",
            response_size=len(html.encode()),
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch(
                "server.modules.recipes.imports.website.extract_recipe",
                return_value=primary,
            ),
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual(181, response.nutrition_per_serving.calories_kcal)
        self.assertEqual(3, response.nutrition_per_serving.protein_g)
        self.assertEqual(25.8, response.nutrition_per_serving.carbs_g)
        self.assertEqual(7.5, response.nutrition_per_serving.fat_g)
        self.assertEqual(2, response.nutrition_per_serving.fiber_g)
        self.assertEqual(
            ("recipe_scrapers", "none", "dom", 5),
            log.call_args.args[-4:],
        )

    def test_fallback_uses_strict_dom_nutrition_semantics(self):
        fixture = DAPUR_FIXTURE_PATH.read_text()
        cases = (
            (fixture, None, "none", 0),
            (
                fixture.replace(
                    "<!-- nutrition-marker -->",
                    "<h2>Informasi Nilai Gizi per Porsi</h2>",
                ),
                181,
                "dom",
                5,
            ),
        )

        for html, calories, enrichment, field_count in cases:
            with self.subTest(enrichment=enrichment):
                page = FetchedRecipePage(
                    html=html,
                    url="https://example.com/dapur-recipe",
                    hostname="example.com",
                    response_size=len(html.encode()),
                )
                with (
                    patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
                    patch(
                        "server.modules.recipes.imports.website.extract_recipe",
                        side_effect=WebsiteImportError("recipe_not_found"),
                    ),
                    patch("server.modules.recipes.imports.website.logger.log") as log,
                ):
                    response = import_recipe_url(
                        ImportRecipeUrlRequest(url=page.url),
                        _auth=Mock(),
                    )

                nutrition = response.nutrition_per_serving
                self.assertEqual(
                    calories,
                    nutrition.calories_kcal if nutrition is not None else None,
                )
                self.assertEqual(
                    ("dom_fallback", "primary_exception", enrichment, field_count),
                    log.call_args.args[-4:],
                )

    def test_dom_enrichment_failure_does_not_fail_complete_primary_recipe(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch("server.modules.recipes.imports.website.extract_recipe", return_value=extracted_recipe()),
            patch(
                "server.modules.recipes.imports.website.extract_recipe_container_text",
                side_effect=WebsiteImportError("recipe_not_found"),
            ),
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual("Soup", response.title)
        self.assertIsNone(response.nutrition_per_serving)
        self.assertEqual(
            ("recipe_scrapers", "none", "none", 0),
            log.call_args.args[-4:],
        )

    def test_rejects_fallback_without_enough_useful_signals(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        with (
            patch("server.modules.recipes.imports.website.fetch_public_html", return_value=page),
            patch(
                "server.modules.recipes.imports.website.extract_recipe",
                side_effect=WebsiteImportError("recipe_not_found"),
            ),
            patch(
                "server.modules.recipes.imports.website.extract_recipe_container_text",
                return_value="Soup",
            ),
            patch("server.modules.recipes.imports.website.logger.log") as log,
        ):
            with self.assertRaises(HTTPException) as caught:
                import_recipe_url(
                    ImportRecipeUrlRequest(url="https://example.com/recipe"),
                    _auth=Mock(),
                )

        self.assertEqual(422, caught.exception.status_code)
        self.assertEqual("recipe_not_found", caught.exception.detail)
        self.assertEqual(
            ("none", "primary_exception", "none", 0),
            log.call_args.args[-4:],
        )
        self.assertNotIn("1 cup water", log.call_args.args[1])

    def test_maps_stable_error_details(self):
        expected = {
            "unsafe_url": 400,
            "page_too_large": 413,
            "unsupported_content_type": 415,
            "recipe_not_found": 422,
            "page_unavailable": 502,
            "fetch_timeout": 504,
        }
        for detail, status in expected.items():
            with self.subTest(detail=detail):
                with (
                    patch(
                        "server.modules.recipes.imports.website.fetch_public_html",
                        side_effect=WebsiteImportError(detail),
                    ),
                    patch("server.modules.recipes.imports.website.extract_recipe_container_text") as fallback,
                    patch("server.modules.recipes.imports.website.logger.log") as log,
                ):
                    with self.assertRaises(HTTPException) as caught:
                        import_recipe_url(
                            ImportRecipeUrlRequest(url="https://example.com/recipe"),
                            _auth=Mock(),
                        )
                self.assertEqual(status, caught.exception.status_code)
                self.assertEqual(detail, caught.exception.detail)
                self.assertEqual(logging.WARNING, log.call_args.args[0])
                self.assertNotIn("exc_info", log.call_args.kwargs)
                fallback.assert_not_called()

    def test_logs_only_sanitized_transport_diagnostics(self):
        error = WebsiteImportError(
            "page_unavailable",
            hostname="example.com",
            upstream_status=503,
            redirect_count=2,
            fetch_phase="response",
            transport_error_kind="http_error",
            transport="curl_cffi",
            browser_profile=HTML_BROWSER_PROFILE,
            request_round_count=2,
            address_attempt_count=2,
            retry_reason="http_503",
        )
        with patch(
            "server.modules.recipes.imports.website.fetch_public_html",
            side_effect=error,
        ), patch(
            "server.modules.recipes.imports.website.logger.log"
        ) as log, self.assertRaises(HTTPException):
            import_recipe_url(
                ImportRecipeUrlRequest(
                    url="https://example.com/recipe?token=do-not-log"
                ),
                _auth=Mock(),
            )

        logged = " ".join(str(value) for value in log.call_args.args)
        self.assertIn("example.com", logged)
        self.assertIn("503", logged)
        self.assertIn("http_error", logged)
        self.assertIn("curl_cffi", logged)
        self.assertIn(HTML_BROWSER_PROFILE, logged)
        self.assertIn("http_503", logged)
        self.assertNotIn("do-not-log", logged)
        self.assertNotIn("exc_info", log.call_args.kwargs)

    def test_parser_failure_keeps_successful_fetch_transport_diagnostics(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
            transport="curl_cffi",
            browser_profile=HTML_BROWSER_PROFILE,
            request_round_count=2,
            address_attempt_count=3,
            retry_reason="read_failure",
        )
        with patch(
            "server.modules.recipes.imports.website.fetch_public_html",
            return_value=page,
        ), patch(
            "server.modules.recipes.imports.website.extract_recipe",
            side_effect=WebsiteImportError("recipe_not_found"),
        ), patch(
            "server.modules.recipes.imports.website.extract_recipe_container_text",
            side_effect=WebsiteImportError("recipe_not_found"),
        ), patch(
            "server.modules.recipes.imports.website.logger.log"
        ) as log, self.assertRaises(HTTPException) as caught:
            import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual(422, caught.exception.status_code)
        logged = " ".join(str(value) for value in log.call_args.args)
        self.assertIn("curl_cffi", logged)
        self.assertIn(HTML_BROWSER_PROFILE, logged)
        self.assertIn("read_failure", logged)
        self.assertNotIn("urllib3", logged)


class ImportRecipeImageEndpointTest(unittest.TestCase):
    def test_endpoint_requires_authentication(self):
        route = next(
            route
            for route in recipe_router.routes
            if getattr(route, "path", None) == "/recipes/import/image"
        )
        dependency_calls = [dependency.call for dependency in route.dependant.dependencies]
        self.assertIn(get_current_user, dependency_calls)

    def test_returns_raw_image_without_persistence(self):
        auth = AuthContext(user=Mock(), supabase=Mock())
        fetched = FetchedRecipeImage(
            body=b"webp-bytes",
            url="https://example.com/photo.webp",
            hostname="example.com",
            response_size=10,
            content_type="image/webp",
        )
        with patch("server.modules.recipes.imports.website.fetch_public_image", return_value=fetched):
            response = import_recipe_image(
                ImportRecipeUrlRequest(url="https://example.com/photo.webp"),
                _auth=auth,
            )

        self.assertEqual(b"webp-bytes", response.body)
        self.assertEqual("image/webp", response.media_type)
        self.assertEqual("no-store", response.headers["cache-control"])
        self.assertEqual([], auth.supabase.mock_calls)

    def test_maps_stable_fetch_errors(self):
        for detail, status in {
            "unsafe_url": 400,
            "page_too_large": 413,
            "unsupported_content_type": 415,
            "page_unavailable": 502,
            "fetch_timeout": 504,
        }.items():
            with self.subTest(detail=detail):
                with patch(
                    "server.modules.recipes.imports.website.fetch_public_image",
                    side_effect=WebsiteImportError(detail),
                ):
                    with self.assertRaises(HTTPException) as caught:
                        import_recipe_image(
                            ImportRecipeUrlRequest(url="https://example.com/photo.jpg"),
                            _auth=Mock(),
                        )
                self.assertEqual(status, caught.exception.status_code)
                self.assertEqual(detail, caught.exception.detail)


if __name__ == "__main__":
    unittest.main()
