import logging
import socket
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import urllib3
from fastapi import HTTPException
from pydantic import ValidationError

from server.main import (
    AuthContext,
    ImportRecipeUrlRequest,
    _dom_nutrition,
    _enrich_primary_groups,
    app,
    get_current_user,
    import_recipe_image,
    import_recipe_url,
    normalize_imported_website_recipe,
    parse_recipe_text,
)
from server.recipe_url_import import (
    MAX_HTML_BYTES,
    MAX_IMAGE_BYTES,
    ExtractedIngredientGroup,
    ExtractedRecipe,
    FetchedRecipeImage,
    FetchedRecipePage,
    WebsiteImportError,
    _validated_target,
    extract_recipe,
    extract_recipe_container_text,
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


class RecipeExtractionTest(unittest.TestCase):
    def test_extracts_and_normalizes_json_ld_fixture(self):
        extracted = extract_recipe(
            FIXTURE_PATH.read_text(),
            "https://example.com/cookies",
        )
        draft = normalize_imported_website_recipe(extracted)

        self.assertEqual("Brown Butter Cookies", draft.title)
        self.assertEqual("Crisp-edged cookies with a soft center.", draft.description)
        self.assertEqual(15, draft.prep_time_minutes)
        self.assertEqual(12, draft.cook_time_minutes)
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

    def test_preserves_non_serving_yield_as_note(self):
        draft = normalize_imported_website_recipe(
            extracted_recipe(yield_text="1 large loaf"),
        )
        self.assertIsNone(draft.servings)
        self.assertEqual("Simple and warm.\nYield: 1 large loaf", draft.description)

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
            page = fetch_public_html(url)
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

    def test_follows_safe_redirect_and_revalidates_hostname(self):
        first = FakePool(FakeResponse(302, {"Location": "https://next.example/food"}))
        second = FakePool(FakeResponse(chunks=[b"done"]))
        answers = [PUBLIC_ANSWER, PUBLIC_ANSWER]
        with (
            patch("server.recipe_url_import.socket.getaddrinfo", side_effect=answers) as resolve,
            patch("server.recipe_url_import.urllib3.HTTPSConnectionPool", side_effect=[first, second]),
        ):
            page = fetch_public_html("https://example.com/recipe")

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
                fetch_public_html("https://example.com/recipe")
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
                fetch_public_html("https://example.com/recipe")
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
    def test_endpoint_requires_authentication(self):
        route = next(
            route
            for route in app.routes
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
            patch("server.main.fetch_public_html", return_value=page),
            patch(
                "server.main.extract_recipe",
                return_value=extracted_recipe(
                    nutrients={
                        "calories": "120 kcal",
                        "proteinContent": "7 g",
                    }
                ),
            ),
            patch("server.main.extract_recipe_container_text") as fallback,
            patch("server.main.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url="https://example.com/recipe"),
                _auth=auth,
            )

        self.assertEqual("Soup", response.title)
        self.assertIn("ingredients", response.model_dump())
        self.assertEqual(120, response.nutrition_per_serving.calories_kcal)
        self.assertEqual(7, response.nutrition_per_serving.protein_g)
        self.assertEqual([], auth.supabase.mock_calls)
        self.assertEqual(logging.INFO, log.call_args.args[0])
        self.assertEqual(
            ("recipe_scrapers", "none", "none", 0),
            log.call_args.args[-4:],
        )
        self.assertFalse(log.call_args.kwargs["exc_info"])
        fallback.assert_not_called()

    def test_falls_back_for_primary_exception_and_each_missing_core_field(self):
        auth = AuthContext(user=Mock(), supabase=Mock())
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        fallback_text = "Soup\nIngredients\n- 1 cup water\nMethod\n1. Stir well."
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
                    patch("server.main.fetch_public_html", return_value=page),
                    patch("server.main.extract_recipe", **extract_effect),
                    patch(
                        "server.main.extract_recipe_container_text",
                        return_value=fallback_text,
                    ) as fallback,
                    patch("server.main.logger.log") as log,
                ):
                    response = import_recipe_url(
                        ImportRecipeUrlRequest(url="https://example.com/recipe"),
                        _auth=auth,
                    )

                self.assertEqual("Soup", response.title)
                self.assertEqual(1, len(response.ingredients[0].items))
                self.assertEqual("water", response.ingredients[0].items[0].name)
                self.assertEqual(1, len(response.instructions[0].steps))
                self.assertEqual(
                    ("dom_fallback", reason, "none", 0),
                    log.call_args.args[-4:],
                )
                fallback.assert_called_once_with("html", max_chars=20_000)

    def test_realistic_unlisted_page_uses_dom_fallback_end_to_end(self):
        page = FetchedRecipePage(
            html=DOM_FIXTURE_PATH.read_text(),
            url="https://www.scottishgoatmeat.co.uk/mild-indian-goat-curry.html",
            hostname="www.scottishgoatmeat.co.uk",
            response_size=DOM_FIXTURE_PATH.stat().st_size,
        )
        with (
            patch("server.main.fetch_public_html", return_value=page),
            patch("server.main.logger.log") as log,
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

    def test_dapur_primary_removes_markers_without_merging_dom_groups(self):
        page = FetchedRecipePage(
            html=DAPUR_FIXTURE_PATH.read_text(),
            url="https://www.dapurumami.com/resep/spring-roll-sayur-ala-saori",
            hostname="www.dapurumami.com",
            response_size=DAPUR_FIXTURE_PATH.stat().st_size,
        )
        with (
            patch("server.main.fetch_public_html", return_value=page),
            patch("server.main.logger.log") as log,
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url=page.url),
                _auth=Mock(),
            )

        self.assertEqual("Spring Roll Sayur ala SAORI", response.title)
        self.assertEqual(6, response.servings)
        self.assertEqual(40, response.cook_time_minutes)
        self.assertEqual(1, len(response.ingredients))
        self.assertIsNone(response.ingredients[0].title)
        self.assertEqual(5, len(response.instructions[0].steps))
        self.assertIsNone(response.nutrition_per_serving)
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
            patch("server.main.fetch_public_html", return_value=page) as fetch,
            patch("server.main.logger.log") as log,
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
            patch("server.main.fetch_public_html", return_value=page),
            patch("server.main.logger.log") as log,
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
            patch("server.main.fetch_public_html", return_value=page),
            patch(
                "server.main.extract_recipe",
                side_effect=WebsiteImportError("recipe_not_found"),
            ),
            patch("server.main.logger.log") as log,
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

    def test_group_enrichment_is_atomic_and_exact(self):
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

        for candidate in mismatches:
            with self.subTest():
                result, enriched = _enrich_primary_groups(
                    draft,
                    extracted,
                    candidate,
                )
                self.assertFalse(enriched)
                self.assertIs(result, draft)
                self.assertEqual([None], [group.title for group in result.ingredients])
                self.assertEqual([None], [group.title for group in result.instructions])

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

        self.assertFalse(enriched)
        self.assertIs(result, draft)
        self.assertEqual("Native Group", result.ingredients[0].title)

    def test_group_enrichment_failure_keeps_complete_primary_import(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        with (
            patch("server.main.fetch_public_html", return_value=page),
            patch("server.main.extract_recipe", return_value=extracted_recipe()),
            patch(
                "server.main._enrich_primary_groups",
                side_effect=RuntimeError("bad optional DOM structure"),
            ),
            patch("server.main.extract_recipe_container_text") as nutrition_dom,
            patch("server.main.logger.log") as log,
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
        page = FetchedRecipePage(
            html=html,
            url="https://www.dapurumami.com/resep/spring-roll-sayur-ala-saori",
            hostname="www.dapurumami.com",
            response_size=len(html.encode()),
        )
        with (
            patch("server.main.fetch_public_html", return_value=page),
            patch("server.main.logger.log") as log,
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
                    patch("server.main.fetch_public_html", return_value=page),
                    patch(
                        "server.main.extract_recipe",
                        side_effect=WebsiteImportError("recipe_not_found"),
                    ),
                    patch("server.main.logger.log") as log,
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
            patch("server.main.fetch_public_html", return_value=page),
            patch("server.main.extract_recipe", return_value=extracted_recipe()),
            patch(
                "server.main.extract_recipe_container_text",
                side_effect=WebsiteImportError("recipe_not_found"),
            ),
            patch("server.main.logger.log") as log,
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

    def test_rejects_fallback_without_both_core_fields(self):
        page = FetchedRecipePage(
            html="html",
            url="https://example.com/recipe",
            hostname="example.com",
            response_size=4,
        )
        with (
            patch("server.main.fetch_public_html", return_value=page),
            patch(
                "server.main.extract_recipe",
                side_effect=WebsiteImportError("recipe_not_found"),
            ),
            patch(
                "server.main.extract_recipe_container_text",
                return_value="Soup\nIngredients\n- 1 cup water",
            ),
            patch("server.main.logger.log") as log,
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
                        "server.main.fetch_public_html",
                        side_effect=WebsiteImportError(detail),
                    ),
                    patch("server.main.extract_recipe_container_text") as fallback,
                    patch("server.main.logger.log") as log,
                ):
                    with self.assertRaises(HTTPException) as caught:
                        import_recipe_url(
                            ImportRecipeUrlRequest(url="https://example.com/recipe"),
                            _auth=Mock(),
                        )
                self.assertEqual(status, caught.exception.status_code)
                self.assertEqual(detail, caught.exception.detail)
                self.assertEqual(logging.WARNING, log.call_args.args[0])
                self.assertTrue(log.call_args.kwargs["exc_info"])
                fallback.assert_not_called()


class ImportRecipeImageEndpointTest(unittest.TestCase):
    def test_endpoint_requires_authentication(self):
        route = next(
            route
            for route in app.routes
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
        with patch("server.main.fetch_public_image", return_value=fetched):
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
                    "server.main.fetch_public_image",
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
