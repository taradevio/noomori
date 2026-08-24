import uvicorn
import logging

from fastapi import FastAPI, HTTPException, Depends, Response
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, HttpUrl, model_validator
from server.api.health import router as health_router
from server.config import settings
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions
from typing import Literal
from uuid import UUID

load_dotenv()
security = HTTPBearer()
logger = logging.getLogger(__name__)
RECIPE_IMAGE_BUCKET = "noomori-recipe-images"
RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

app = FastAPI(
    title="Noomori API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    health_router,
    prefix="/api/v1",
)


@dataclass
class AuthContext:
    # Keep the verified user and their request-scoped Supabase client together so
    # route handlers cannot accidentally issue database calls as an anonymous user.
    user: object
    supabase: Client

class CreateHousehold(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RecipeIngredient(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)


class RecipeIngredientGroup(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    items: list[RecipeIngredient]


class RecipeInstruction(BaseModel):
    text: str = Field(max_length=2000)


class RecipeInstructionGroup(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    steps: list[RecipeInstruction]


class RecipeNutrition(BaseModel):
    calories_kcal: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    saturated_fat_g: float | None = Field(default=None, ge=0)
    cholesterol_mg: float | None = Field(default=None, ge=0)
    fiber_g: float | None = Field(default=None, ge=0)
    sugar_g: float | None = Field(default=None, ge=0)
    sodium_mg: float | None = Field(default=None, ge=0)


class CreateRecipe(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    ingredients: list[RecipeIngredientGroup]
    instructions: list[RecipeInstructionGroup]
    servings: int = Field(gt=0)
    prep_time_minutes: int | None = Field(default=None, ge=0)
    cook_time_minutes: int | None = Field(default=None, ge=0)
    nutrition_per_serving: RecipeNutrition | None = None
    source_type: Literal["my_recipe", "family", "website"]
    source_person_name: str | None = Field(default=None, max_length=200)
    source_url: HttpUrl | None = None

    @model_validator(mode="after")
    def validate_source(self):
        if self.source_type == "family" and not self.source_person_name:
            raise ValueError("source_person_name is required for family recipes")
        if self.source_type == "website" and self.source_url is None:
            raise ValueError("source_url is required for website recipes")
        if self.source_type == "my_recipe" and (
            self.source_person_name is not None or self.source_url is not None
        ):
            raise ValueError("my_recipe cannot include source details")
        return self


class RecipeImageUpdate(BaseModel):
    image_path: str = Field(min_length=1, max_length=500)


def get_supabase(access_token: str | None = None) -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase credentials are missing")

    # The publishable key does not bypass RLS. The caller's access token is
    # attached to every service client so database and Storage share one identity.
    options = None
    if access_token:
        options = ClientOptions(
            headers={"Authorization": f"Bearer {access_token}"},
        )
    return create_client(settings.supabase_url, settings.supabase_key, options)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> AuthContext:
    access_token = credentials.credentials
    supabase = get_supabase(access_token)

    # Validate the bearer token with Supabase Auth before using its identity in
    # application logic or forwarding it to the database API.
    try:
        response = supabase.auth.get_user(access_token)
    except Exception as exc:
        logger.warning("Authentication failed", exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid Authentication") from exc

    if not response.user:
        logger.warning("Authentication returned no user")
        raise HTTPException(status_code=401, detail="Invalid Authentication")

    # Forward the same JWT to PostgREST. This supplies auth.uid() for RLS; it
    # authenticates the request but intentionally does not bypass any policy.
    supabase.postgrest.auth(access_token)

    return AuthContext(user=response.user, supabase=supabase)


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
        .select("*")
        .eq("id", str(recipe_id))
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return response.data[0]


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


def recipe_with_signed_image(auth: AuthContext, recipe: dict) -> dict:
    result = dict(recipe)
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


# PERFORMANCE: Sign every unique path in one Storage round trip. Individual
# failures remain null so one broken image cannot delay or fail the library.
def recipes_with_signed_images(
    auth: AuthContext,
    recipes: list[dict],
) -> list[dict]:
    results = []
    paths = []
    for recipe in recipes:
        result = dict(recipe)
        result["image_url"] = None
        results.append(result)
        if result.get("image_path"):
            paths.append(result["image_path"])

    unique_paths = list(dict.fromkeys(paths))
    if not unique_paths:
        return results

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
        return results

    urls_by_path = {}
    for signed in signed_images:
        path = signed.get("path")
        url = signed.get("signedURL") or signed.get("signedUrl")
        if path and url and not signed.get("error"):
            urls_by_path[path] = url
        elif path:
            logger.warning("Failed to sign recipe image path=%s", path)

    for result in results:
        result["image_url"] = urls_by_path.get(result.get("image_path"))
    return results


# PERFORMANCE: supabase-py is synchronous. Regular def handlers run in FastAPI's
# thread pool instead of serializing unrelated requests on the event loop.
@app.get("/recipes")
def list_recipes(auth: AuthContext = Depends(get_current_user)):
    started_at = perf_counter()
    response = (
        auth.supabase
        .table("recipes")
        .select("*")
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


@app.get("/recipes/{recipe_id}")
def get_recipe(
    recipe_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    return recipe_with_signed_image(auth, get_readable_recipe(auth, recipe_id))


@app.post("/recipes")
@app.post("/add-recipes")
def create_recipe(
    payload: CreateRecipe,
    auth: AuthContext = Depends(get_current_user),
):
    # PERFORMANCE: Track database plus response-signing time for save diagnostics.
    started_at = perf_counter()
    values = payload.model_dump(mode="json")
    values["owner_user_id"] = auth.user.id
    values["image_path"] = None
    logger.info("Creating recipe user_id=%s", auth.user.id)
    try:
        response = auth.supabase.table("recipes").insert(values).execute()
        recipe = response.data[0]
        logger.info(
            "Recipe created recipe_id=%s user_id=%s duration_ms=%.1f",
            recipe["id"],
            auth.user.id,
            (perf_counter() - started_at) * 1000,
        )
        return recipe_with_signed_image(auth, recipe)
    except Exception as exc:
        logger.exception(
            "Failed to create recipe user_id=%s duration_ms=%.1f",
            auth.user.id,
            (perf_counter() - started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not create recipe") from exc


@app.put("/recipes/{recipe_id}")
def update_recipe(
    recipe_id: UUID,
    payload: CreateRecipe,
    auth: AuthContext = Depends(get_current_user),
):
    get_owned_recipe(auth, recipe_id)
    logger.info("Updating recipe recipe_id=%s", recipe_id)
    try:
        response = (
            auth.supabase
            .table("recipes")
            .update(payload.model_dump(mode="json"))
            .eq("id", str(recipe_id))
            .eq("owner_user_id", auth.user.id)
            .execute()
        )
        logger.info("Recipe updated recipe_id=%s", recipe_id)
        return recipe_with_signed_image(auth, response.data[0])
    except Exception as exc:
        logger.exception("Failed to update recipe recipe_id=%s", recipe_id)
        raise HTTPException(status_code=500, detail="Could not update recipe") from exc


# NOTE: Ownership is recipe-scoped; household roles grant no delete authority.
# Delete the row first, then clean up its Storage object best-effort.
@app.delete("/recipes/{recipe_id}", status_code=204)
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
        if not response.data:
            raise RuntimeError("Recipe row was not deleted")
        logger.info(
            "Recipe row deleted recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - row_delete_started_at) * 1000,
        )
    except Exception as exc:
        logger.exception(
            "Failed to delete recipe row recipe_id=%s duration_ms=%.1f",
            recipe_id,
            (perf_counter() - row_delete_started_at) * 1000,
        )
        raise HTTPException(status_code=500, detail="Could not delete recipe") from exc

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


@app.put("/recipes/{recipe_id}/image")
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


@app.delete("/recipes/{recipe_id}/image")
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


# Create the household, establish its first owner, and complete onboarding.
# NOTE: These are separate PostgREST requests, so a later failure does not roll
# back an earlier write. Move this workflow into a database RPC if it must be atomic.
# PERFORMANCE: This handler also uses synchronous supabase-py calls, so keep it
# in FastAPI's worker thread pool rather than blocking the event loop.
@app.post("/household")
def create_household(payload: CreateHousehold, auth: AuthContext = Depends(get_current_user)):
    supabase = auth.supabase
    user_id = auth.user.id
    try:
        logger.info(
            "Creating household for user_id=%s",
            user_id,
        )
        # supabase-py returns the inserted row by default. The row must therefore
        # satisfy both the households INSERT policy and its SELECT policy.
        household_response = (
            supabase
            .table("households")
            .insert({
                "name": payload.name,
                "created_by": user_id,
            })
            .execute()
        )

        household = household_response.data[0]
        household_id = household["id"]

        logger.info(
            "Household created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        # The bootstrap policy must allow the creator to add their own initial
        # owner membership. Returning it also requires a matching SELECT policy.
        member_response = (
            supabase
            .table("household_members")
            .insert({
                "household_id": household_id,
                "user_id": user_id,
                "role": "owner",
            })
            .execute()
        )

        logger.info(
            "Owner membership created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        date_now = datetime.now(timezone.utc).isoformat()

        # Scope the update to the authenticated user's profile; the profiles
        # SELECT and UPDATE policies must permit the same user-owned row.
        onboarding_response = (
            supabase
            .table("profiles")
            .update({
                "onboarding_completed_at": date_now,
                "updated_at": date_now,
            })
            .eq("id", user_id)
            .execute()
        )

        logger.info(
            "Onboarding completed user_id=%s household_id=%s",
            user_id,
            household_id,
        )

        return {
            "household": household,
            "membership": member_response.data[0],
            "profile": onboarding_response.data[0],
        }

    except Exception as exc:
        logger.exception(
            "Failed to create household user_id=%s",
            user_id,
        )
        raise HTTPException(status_code=500, detail=str(exc),) from exc

def main() -> None:
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
