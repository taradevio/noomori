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
    app,
    get_current_user,
    import_recipe_image,
    import_recipe_url,
    normalize_imported_website_recipe,
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
    fetch_public_html,
    fetch_public_image,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "recipe_url_import.html"
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
            patch("server.main.extract_recipe", return_value=extracted_recipe()),
        ):
            response = import_recipe_url(
                ImportRecipeUrlRequest(url="https://example.com/recipe"),
                _auth=auth,
            )

        self.assertEqual("Soup", response.title)
        self.assertIn("ingredients", response.model_dump())
        self.assertEqual([], auth.supabase.mock_calls)

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
                with patch(
                    "server.main.fetch_public_html",
                    side_effect=WebsiteImportError(detail),
                ):
                    with self.assertRaises(HTTPException) as caught:
                        import_recipe_url(
                            ImportRecipeUrlRequest(url="https://example.com/recipe"),
                            _auth=Mock(),
                        )
                self.assertEqual(status, caught.exception.status_code)
                self.assertEqual(detail, caught.exception.detail)


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
