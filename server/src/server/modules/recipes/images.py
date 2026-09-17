import logging
from uuid import UUID

from server.core.auth import AuthContext
from server.core.database import get_admin_supabase


logger = logging.getLogger(__name__)
RECIPE_IMAGE_BUCKET = "noomori-recipe-images"
RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
HANDOFF_IMAGE_PREFIX = "recipe-handoffs/"


def delete_recipe_image_object(auth: AuthContext, image_path: str) -> None:
    client = (
        get_admin_supabase()
        if image_path.startswith(HANDOFF_IMAGE_PREFIX)
        else auth.supabase
    )
    client.storage.from_(RECIPE_IMAGE_BUCKET).remove([image_path])


# Purpose: Flatten the recipe share relation into a client-facing boolean flag.
# Connects to: Called by server/src/server/modules/recipes/images.py::{recipe_with_signed_image(),recipes_with_signed_images()}; has no downstream local function calls.
def recipe_with_share_state(recipe: dict) -> dict:
    result = dict(recipe)
    result["is_shared"] = bool(result.pop("household_recipe_shares", []))
    return result


# Purpose: Verify that an image path belongs to the expected user and recipe.
# Connects to: Called by server/src/server/modules/recipes/service.py::activate_recipe_image(); has no downstream local function calls.
def valid_recipe_image_path(path: str, user_id: str, recipe_id: UUID) -> bool:
    parts = path.split("/")
    if len(parts) != 4 or parts[:3] != ["recipes", user_id, str(recipe_id)]:
        return False
    filename = parts[3]
    if not filename.endswith(".webp"):
        return False
    try:
        UUID(filename.removesuffix(".webp"))
    except ValueError:
        return False
    return True


# Purpose: Add share state and a temporary signed image URL to one recipe.
# Connects to: Called by server/src/server/modules/recipes/service.py::{get_recipe(),create_recipe(),update_recipe(),set_recipe_shared(),activate_recipe_image(),remove_recipe_image()}; calls server/src/server/modules/recipes/images.py::recipe_with_share_state() and Supabase Storage create_signed_url().
def recipe_with_signed_image(auth: AuthContext, recipe: dict) -> dict:
    result = recipe_with_share_state(recipe)
    image_path = result.get("image_path")
    result["image_url"] = None
    if image_path:
        try:
            signed = (
                auth.supabase.storage
                .from_(RECIPE_IMAGE_BUCKET)
                .create_signed_url(image_path, 3600)
            )
            result["image_url"] = signed.get("signedURL") or signed.get("signedUrl")
        except Exception:
            logger.exception("Failed to sign recipe image recipe_id=%s", result.get("id"))
    return result


# Purpose: Batch-sign unique recipe image paths and map successful URLs by path.
# Connects to: Called by server/src/server/modules/cookbooks/service.py::cookbook_summary_rows() and server/src/server/modules/recipes/images.py::recipes_with_signed_images(); calls Supabase Storage create_signed_urls().
def signed_recipe_image_urls(
    auth: AuthContext,
    image_paths: list[str],
) -> dict[str, str]:
    unique_paths = list(dict.fromkeys(path for path in image_paths if path))
    if not unique_paths:
        return {}

    try:
        signed_images = (
            auth.supabase.storage
            .from_(RECIPE_IMAGE_BUCKET)
            .create_signed_urls(unique_paths, 3600)
        )
    except Exception:
        logger.exception(
            "Failed to batch-sign recipe images count=%s",
            len(unique_paths),
        )
        return {}

    urls_by_path = {}
    for signed in signed_images:
        path = signed.get("path")
        url = signed.get("signedURL") or signed.get("signedUrl")
        if path and url and not signed.get("error"):
            urls_by_path[path] = url
        elif path:
            logger.warning("Failed to sign recipe image path=%s", path)
    return urls_by_path


# PERFORMANCE: Sign every unique path in one Storage round trip. Individual
# failures remain null so one broken image cannot delay or fail the library.
# Purpose: Enrich a recipe collection with share state and batch-signed image URLs.
# Connects to: Called by server/src/server/modules/cookbooks/service.py::cookbook_detail() and server/src/server/modules/recipes/service.py::{list_recipes(),list_household_recipes()}; calls server/src/server/modules/recipes/images.py::{recipe_with_share_state(),signed_recipe_image_urls()}.
def recipes_with_signed_images(
    auth: AuthContext,
    recipes: list[dict],
) -> list[dict]:
    results = []
    paths = []
    for recipe in recipes:
        result = recipe_with_share_state(recipe)
        result["image_url"] = None
        results.append(result)
        if result.get("image_path"):
            paths.append(result["image_path"])

    urls_by_path = signed_recipe_image_urls(auth, paths)

    for result in results:
        result["image_url"] = urls_by_path.get(result.get("image_path"))
    return results
