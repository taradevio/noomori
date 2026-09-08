import logging
from uuid import UUID

from fastapi import Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

from server.core.auth import AuthContext, get_current_user
from server.core.database import rpc_result
from server.modules.recipes.images import recipes_with_signed_images, signed_recipe_image_urls


logger = logging.getLogger(__name__)
COOKBOOK_SELECT = "id,title,created_at"
RECIPE_SELECT = "*,household_recipe_shares(recipe_id)"


class CookbookTitle(BaseModel):
    title: str = Field(min_length=1, max_length=100)

    # Purpose: Trim cookbook titles and reject values that contain only whitespace.
    # Connects to: Cookbook create and rename payload validation.
    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Cookbook title cannot be blank")
        return title


class CreateCookbook(CookbookTitle):
    recipe_ids: list[UUID] = Field(default_factory=list)


class ReplaceCookbookRecipes(BaseModel):
    recipe_ids: list[UUID] = Field(default_factory=list)


# Purpose: Execute a cookbook RPC and translate its status into HTTP behavior.
# Connects to: Supabase cookbook RPCs and the shared RPC response validator.
def execute_cookbook_rpc(
    auth: AuthContext,
    name: str,
    params: dict,
) -> dict:
    try:
        response = auth.supabase.rpc(name, params).execute()
        result = rpc_result(response)
    except Exception as exc:
        logger.exception(
            "Cookbook RPC failed operation=%s user_id=%s",
            name,
            auth.user.id,
        )
        raise HTTPException(
            status_code=500,
            detail="Could not save the cookbook",
        ) from exc

    if result["status"] == "INVALID_RECIPE":
        raise HTTPException(status_code=400, detail="A selected recipe is unavailable")
    if result["status"] == "COOKBOOK_NOT_FOUND":
        raise HTTPException(status_code=404, detail="Cookbook not found")
    if result["status"] != "OK":
        raise RuntimeError(f"Unexpected cookbook RPC status: {result['status']}")
    return result


# Purpose: Load a cookbook only when it belongs to the authenticated user.
# Connects to: Cookbook detail/rename flows and the Supabase cookbooks table.
def get_owned_cookbook(auth: AuthContext, cookbook_id: UUID) -> dict:
    response = (
        auth.supabase
        .table("cookbooks")
        .select(COOKBOOK_SELECT)
        .eq("id", str(cookbook_id))
        .eq("owner_user_id", auth.user.id)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Cookbook not found")
    return response.data[0]


# Purpose: Collect the recipe identifiers currently assigned to a cookbook.
# Connects to: Cookbook detail assembly and the cookbook_recipes join table.
def cookbook_member_recipe_ids(auth: AuthContext, cookbook_id: UUID) -> list[str]:
    response = (
        auth.supabase
        .table("cookbook_recipes")
        .select("recipe_id")
        .eq("cookbook_id", str(cookbook_id))
        .execute()
    )
    return [row["recipe_id"] for row in response.data]


# Purpose: Enrich cookbook rows with recipe counts and signed cover images.
# Connects to: The cookbook list endpoint, recipe membership, and Storage signing.
def cookbook_summary_rows(auth: AuthContext, cookbooks: list[dict]) -> list[dict]:
    if not cookbooks:
        return []

    cookbook_ids = [cookbook["id"] for cookbook in cookbooks]
    membership_response = (
        auth.supabase
        .table("cookbook_recipes")
        .select("cookbook_id,recipe_id")
        .in_("cookbook_id", cookbook_ids)
        .execute()
    )
    member_ids: dict[str, list[str]] = {cookbook_id: [] for cookbook_id in cookbook_ids}
    for membership in membership_response.data:
        member_ids.setdefault(membership["cookbook_id"], []).append(
            membership["recipe_id"]
        )

    recipe_ids = list(dict.fromkeys(
        recipe_id
        for cookbook_recipe_ids in member_ids.values()
        for recipe_id in cookbook_recipe_ids
    ))
    recipe_rows = []
    if recipe_ids:
        recipe_rows = (
            auth.supabase
            .table("recipes")
            .select("id,image_path,created_at")
            .eq("owner_user_id", auth.user.id)
            .in_("id", recipe_ids)
            .order("created_at", desc=True)
            .execute()
            .data
        )

    cover_paths: dict[str, list[str]] = {}
    all_cover_paths: list[str] = []
    for cookbook_id, ids in member_ids.items():
        ids_set = set(ids)
        paths = [
            recipe["image_path"]
            for recipe in recipe_rows
            if recipe["id"] in ids_set and recipe.get("image_path")
        ][:4]
        cover_paths[cookbook_id] = paths
        all_cover_paths.extend(paths)
    image_urls = signed_recipe_image_urls(auth, all_cover_paths)

    return [
        {
            "id": cookbook["id"],
            "title": cookbook["title"],
            "recipe_count": len(member_ids.get(cookbook["id"], [])),
            "cover_image_urls": [
                image_urls[path]
                for path in cover_paths.get(cookbook["id"], [])
                if path in image_urls
            ],
        }
        for cookbook in cookbooks
    ]


# Purpose: Assemble one owned cookbook with all of its readable recipe records.
# Connects to: Cookbook endpoints, membership lookup, recipes, and image signing.
def cookbook_detail(auth: AuthContext, cookbook_id: UUID) -> dict:
    cookbook = get_owned_cookbook(auth, cookbook_id)
    recipe_ids = cookbook_member_recipe_ids(auth, cookbook_id)
    recipes = []
    if recipe_ids:
        response = (
            auth.supabase
            .table("recipes")
            .select(RECIPE_SELECT)
            .eq("owner_user_id", auth.user.id)
            .in_("id", recipe_ids)
            .order("created_at", desc=True)
            .execute()
        )
        recipes = recipes_with_signed_images(auth, response.data)
    return {
        "id": cookbook["id"],
        "title": cookbook["title"],
        "recipe_count": len(recipes),
        "recipes": recipes,
    }


# Purpose: Return summaries for every cookbook owned by the current user.
# Connects to: The GET /cookbooks route and the Supabase cookbooks table.
def list_cookbooks(auth: AuthContext = Depends(get_current_user)):
    response = (
        auth.supabase
        .table("cookbooks")
        .select(COOKBOOK_SELECT)
        .eq("owner_user_id", auth.user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return cookbook_summary_rows(auth, response.data)


# Purpose: Create a personal cookbook and return its fully assembled detail.
# Connects to: The POST /cookbooks route and create_personal_cookbook RPC.
def create_cookbook(
    payload: CreateCookbook,
    auth: AuthContext = Depends(get_current_user),
):
    result = execute_cookbook_rpc(
        auth,
        "create_personal_cookbook",
        {
            "p_title": payload.title,
            "p_recipe_ids": list(dict.fromkeys(map(str, payload.recipe_ids))),
        },
    )
    return cookbook_detail(auth, UUID(result["cookbook_id"]))


# Purpose: Return one cookbook after enforcing authenticated ownership.
# Connects to: The GET /cookbooks/{cookbook_id} route and detail assembler.
def get_cookbook(
    cookbook_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    return cookbook_detail(auth, cookbook_id)


# Purpose: Rename an owned cookbook and return its refreshed detail.
# Connects to: The PUT cookbook route and the Supabase cookbooks table.
def rename_cookbook(
    cookbook_id: UUID,
    payload: CookbookTitle,
    auth: AuthContext = Depends(get_current_user),
):
    try:
        response = (
            auth.supabase
            .table("cookbooks")
            .update({"title": payload.title})
            .eq("id", str(cookbook_id))
            .eq("owner_user_id", auth.user.id)
            .select(COOKBOOK_SELECT)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not rename cookbook cookbook_id=%s", cookbook_id)
        raise HTTPException(status_code=500, detail="Could not rename cookbook") from exc
    if not response.data:
        raise HTTPException(status_code=404, detail="Cookbook not found")
    return cookbook_detail(auth, cookbook_id)


# Purpose: Replace a cookbook's complete recipe membership set.
# Connects to: The recipe-membership route and replace_personal_cookbook_recipes RPC.
def replace_cookbook_recipes(
    cookbook_id: UUID,
    payload: ReplaceCookbookRecipes,
    auth: AuthContext = Depends(get_current_user),
):
    execute_cookbook_rpc(
        auth,
        "replace_personal_cookbook_recipes",
        {
            "p_cookbook_id": str(cookbook_id),
            "p_recipe_ids": list(dict.fromkeys(map(str, payload.recipe_ids))),
        },
    )
    return cookbook_detail(auth, cookbook_id)


# Purpose: Delete a cookbook owned by the authenticated user.
# Connects to: The DELETE cookbook route and the Supabase cookbooks table.
def delete_cookbook(
    cookbook_id: UUID,
    auth: AuthContext = Depends(get_current_user),
):
    try:
        response = (
            auth.supabase
            .table("cookbooks")
            .delete()
            .eq("id", str(cookbook_id))
            .eq("owner_user_id", auth.user.id)
            .execute()
        )
    except Exception as exc:
        logger.exception("Could not delete cookbook cookbook_id=%s", cookbook_id)
        raise HTTPException(status_code=500, detail="Could not delete cookbook") from exc
    if not response.data:
        raise HTTPException(status_code=404, detail="Cookbook not found")
    return Response(status_code=204)
