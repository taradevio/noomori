import logging
from time import perf_counter
from uuid import UUID

from fastapi import BackgroundTasks, Depends, Header, HTTPException, Response

from server.core.auth import AuthContext, get_current_user
from server.modules.households.service import execute_household_rpc, raise_household_rpc_error
from server.modules.notifications.service import queue_household_recipe_notification
from server.modules.recipes.images import (
    RECIPE_IMAGE_BUCKET,
    RECIPE_IMAGE_MAX_BYTES,
    recipe_with_signed_image,
    recipes_with_signed_images,
    valid_recipe_image_path,
)
from server.modules.recipes.imports.text import parse_recipe_text
from server.modules.recipes.schemas import (
    CreateRecipe,
    ImportedRecipeTextDraft,
    ImportRecipeTextRequest,
    RecipeImageUpdate,
)


logger = logging.getLogger(__name__)
RECIPE_SELECT = "*,household_recipe_shares(recipe_id)"
HOUSEHOLD_RECIPE_SELECT = "*,household_recipe_shares!inner(recipe_id)"


def get_owned_recipe(auth: AuthContext, recipe_id: UUID) -> dict:
    response = (
        auth.supabase
        .table("recipes")
        .select("id,owner_user_id,image_path")
        .eq("id", str(recipe_id))
        .eq("owner_user_id", auth.user.id)
        .limit(1)
        .execute()
    )
    if not response.data:
        logger.info("Owned recipe not found recipe_id=%s", recipe_id)
        raise HTTPException(status_code=404, detail="Recipe not found")
    return response.data[0]


def get_readable_recipe(auth: AuthContext, recipe_id: UUID) -> dict:
    response = (
        auth.supabase
        .table("recipes")
        .select(RECIPE_SELECT)
        .eq("id", str(recipe_id))
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return response.data[0]


def import_recipe_text(
    payload: ImportRecipeTextRequest,
    _auth: AuthContext = Depends(get_current_user),
):
    try:
        return parse_recipe_text(payload.text)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Could not identify enough recipe information",
        ) from exc


def list_recipes(auth: AuthContext = Depends(get_current_user)):
    started_at = perf_counter()
    response = (
        auth.supabase
        .table("recipes")
        .select(RECIPE_SELECT)
        .eq("owner_user_id", auth.user.id)
        .order("created_at", desc=True)
        .execute()
    )
    recipes = recipes_with_signed_images(auth, response.data)
    # PERFORMANCE: Counts and wall time expose when list growth or signing starts
    # dominating library load latency.
    logger.info(
        "Recipes listed user_id=%s recipe_count=%s image_count=%s duration_ms=%.1f",
        auth.user.id,
        len(recipes),
        sum(1 for recipe in recipes if recipe.get("image_path")),
        (perf_counter() - started_at) * 1000,
    )
    return recipes


def list_household_recipes(auth: AuthContext = Depends(get_current_user)):
    started_at = perf_counter()
    response = (
        auth.supabase
        .table("recipes")
        .select(HOUSEHOLD_RECIPE_SELECT)
        .order("created_at", desc=True)
        .execute()
    )
    recipes = recipes_with_signed_images(auth, response.data)
    logger.info(
        "Household recipes listed user_id=%s recipe_count=%s image_count=%s "
        "duration_ms=%.1f",
        auth.user.id,
        len(recipes),
        sum(1 for recipe in recipes if recipe.get("image_path")),
        (perf_counter() - started_at) * 1000,
    )
    return recipes


def get_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    return recipe_with_signed_image(auth, get_readable_recipe(auth, recipe_id))


def create_recipe(
    payload: CreateRecipe,
    recipe_creation_id: UUID = Header(alias="Recipe-Creation-Id"),
    auth: AuthContext = Depends(get_current_user),
):
    # PERFORMANCE: Track database plus response-signing time for save diagnostics.
    started_at = perf_counter()
    values = payload.model_dump(mode="json")
    values["id"] = str(recipe_creation_id)
    values["owner_user_id"] = auth.user.id
    logger.info(
        "Saving recipe recipe_id=%s user_id=%s",
        recipe_creation_id,
        auth.user.id,
    )
    try:
        response = (
            auth.supabase
            .table("recipes")
            .upsert(values, on_conflict="id")
            .select(RECIPE_SELECT)
            .execute()
        )
        recipe = response.data[0]
        logger.info(
            "Recipe saved recipe_id=%s user_id=%s duration_ms=%.1f",
            recipe["id"],
            auth.user.id,
            (perf_counter() - started_at) * 1000,
        )
        return recipe_with_signed_image(auth, recipe)
    except Exception as exc:
        logger.exception(
            "Failed to save recipe user_id=%s duration_ms=%.1f",
            auth.user.id,
            (perf_counter() - started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not create recipe") from exc


def update_recipe(
    recipe_id: UUID,
    payload: CreateRecipe,
    auth: AuthContext = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    started_at = perf_counter()
    logger.info("Updating recipe recipe_id=%s", recipe_id)
    try:
        response = (
            auth.supabase
            .table("recipes")
            .update(payload.model_dump(mode="json"))
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .select(RECIPE_SELECT)
            .execute()
        )
    except Exception as exc:
        logger.exception(
            "Failed to update recipe recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not update recipe") from exc

    if not response.data:
        logger.info("Recipe not found during update recipe_id=%s", recipe_id)
        raise HTTPException(status_code=404, detail="Recipe not found")

    logger.info(
        "Recipe updated recipe_id=%s duration_ms=%.1f",
        recipe_id,
        (perf_counter() - started_at) * 1000,
    )
    recipe = recipe_with_signed_image(auth, response.data[0])
    if recipe.get("is_shared"):
        queue_household_recipe_notification(
            background_tasks,
            auth,
            "edited",
            recipe,
        )
    return recipe


def set_recipe_shared(
    recipe_id: UUID,
    shared: bool,
    auth: AuthContext,
    background_tasks: BackgroundTasks | None = None,
):
    result = execute_household_rpc(
        auth,
        "set_recipe_household_shared",
        {"p_recipe_id": str(recipe_id), "p_shared": shared},
    )
    if result["status"] != "OK":
        raise_household_rpc_error(result)
    recipe = recipe_with_signed_image(auth, get_readable_recipe(auth, recipe_id))
    if result.get("changed"):
        queue_household_recipe_notification(
            background_tasks,
            auth,
            "added" if shared else "unshared",
            recipe,
        )
    return recipe


def share_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    return set_recipe_shared(recipe_id, True, auth, background_tasks)


def unshare_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    return set_recipe_shared(recipe_id, False, auth, background_tasks)


def delete_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    started_at = perf_counter()
    logger.info(
        "Recipe delete started recipe_id=%s user_id=%s",
        recipe_id,
        auth.user.id,
    )
    recipe = get_owned_recipe(auth, recipe_id)
    row_delete_started_at = perf_counter()
    try:
        response = (
            auth.supabase
            .table("recipes")
            .delete()
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .execute()
        )
    except Exception as exc:
        logger.exception(
            "Failed to delete recipe row recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - row_delete_started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not delete recipe") from exc
    if not response.data:
        logger.info("Shared recipe delete blocked recipe_id=%s", recipe_id)
        raise HTTPException(
            status_code=409,
            detail="Unshare recipe before deleting",
        )
    logger.info(
        "Recipe row deleted recipe_id=%s duration_ms=%.1f",
        recipe_id,
        (perf_counter() - row_delete_started_at) * 1000,
    )

    image_path = recipe.get("image_path")
    image_cleanup = "not_needed"
    if image_path:
        try:
            auth.supabase.storage.from_(RECIPE_IMAGE_BUCKET).remove([image_path])
            image_cleanup = "deleted"
        except Exception:
            image_cleanup = "failed"
            logger.exception(
                "Failed to delete recipe image object recipe_id=%s",
                recipe_id,
            )
    logger.info(
        "Recipe delete completed recipe_id=%s image_cleanup=%s duration_ms=%.1f",
        recipe_id,
        image_cleanup,
        (perf_counter() - started_at) * 1000,
    )
    return Response(status_code=204)


def activate_recipe_image(
    recipe_id: UUID,
    payload: RecipeImageUpdate,
    auth: AuthContext = Depends(get_current_user),
):
    logger.info("Activating recipe image recipe_id=%s", recipe_id)
    recipe = get_owned_recipe(auth, recipe_id)
    if not valid_recipe_image_path(payload.image_path, auth.user.id, recipe_id):
        logger.warning("Rejected recipe image path recipe_id=%s", recipe_id)
        raise HTTPException(status_code=400, detail="Invalid recipe image path")

    try:
        info = (
            auth.supabase.storage
            .from_(RECIPE_IMAGE_BUCKET)
            .info(payload.image_path)
        )
    except Exception as exc:
        logger.warning(
            "Recipe image object not found recipe_id=%s",
            recipe_id,
            exc_info=True,
        )
        raise HTTPException(status_code=400, detail="Recipe image was not found") from exc

    metadata = info.get("metadata") or {}
    mime_type = (
        metadata.get("mimetype")
        or info.get("content_type")
        or info.get("contentType")
    )
    size = metadata.get("size") or info.get("size")
    if mime_type != "image/webp" or (
        isinstance(size, int) and size > RECIPE_IMAGE_MAX_BYTES
    ):
        logger.warning(
            "Rejected recipe image metadata recipe_id=%s mime_type=%s size=%s",
            recipe_id,
            mime_type,
            size,
        )
        raise HTTPException(status_code=400, detail="Recipe image is not an accepted WebP")

    try:
        response = (
            auth.supabase
            .table("recipes")
            .update({"image_path": payload.image_path})
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .select(RECIPE_SELECT)
            .execute()
        )
        updated = response.data[0]
        logger.info("Recipe image activated recipe_id=%s", recipe_id)
    except Exception as exc:
        logger.exception("Failed to activate recipe image recipe_id=%s", recipe_id)
        raise HTTPException(status_code=500, detail="Could not activate recipe image") from exc

    old_path = recipe.get("image_path")
    if old_path and old_path != payload.image_path:
        try:
            auth.supabase.storage.from_(RECIPE_IMAGE_BUCKET).remove([old_path])
        except Exception:
            logger.exception("Failed to remove replaced recipe image recipe_id=%s", recipe_id)
    return recipe_with_signed_image(auth, updated)


def remove_recipe_image(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    logger.info("Removing recipe image recipe_id=%s", recipe_id)
    recipe = get_owned_recipe(auth, recipe_id)
    try:
        response = (
            auth.supabase
            .table("recipes")
            .update({"image_path": None})
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .select(RECIPE_SELECT)
            .execute()
        )
        updated = response.data[0]
        logger.info("Recipe image removed recipe_id=%s", recipe_id)
    except Exception as exc:
        logger.exception("Failed to remove recipe image recipe_id=%s", recipe_id)
        raise HTTPException(status_code=500, detail="Could not remove recipe image") from exc

    old_path = recipe.get("image_path")
    if old_path:
        try:
            auth.supabase.storage.from_(RECIPE_IMAGE_BUCKET).remove([old_path])
        except Exception:
            logger.exception("Failed to delete recipe image object recipe_id=%s", recipe_id)
    return recipe_with_signed_image(auth, updated)

