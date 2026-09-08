from fastapi import APIRouter

from server.modules.recipes import service
from server.modules.recipes.imports import website
from server.modules.recipes.schemas import ImportedRecipeTextDraft


router = APIRouter()
router.add_api_route(
    "/recipes/import/text",
    service.import_recipe_text,
    methods=["POST"],
    response_model=ImportedRecipeTextDraft,
)
router.add_api_route(
    "/recipes/import/url",
    website.import_recipe_url,
    methods=["POST"],
    response_model=ImportedRecipeTextDraft,
)
router.add_api_route(
    "/recipes/import/image", website.import_recipe_image, methods=["POST"]
)
router.add_api_route("/recipes", service.list_recipes, methods=["GET"])
router.add_api_route(
    "/household/recipes", service.list_household_recipes, methods=["GET"]
)
router.add_api_route("/recipes/{recipe_id}", service.get_recipe, methods=["GET"])
router.add_api_route("/recipes", service.create_recipe, methods=["POST"])
router.add_api_route("/add-recipes", service.create_recipe, methods=["POST"])
router.add_api_route(
    "/recipes/{recipe_id}", service.update_recipe, methods=["PUT"]
)
router.add_api_route(
    "/recipes/{recipe_id}/share", service.share_recipe, methods=["PUT"]
)
router.add_api_route(
    "/recipes/{recipe_id}/share", service.unshare_recipe, methods=["DELETE"]
)
router.add_api_route(
    "/recipes/{recipe_id}",
    service.delete_recipe,
    methods=["DELETE"],
    status_code=204,
)
router.add_api_route(
    "/recipes/{recipe_id}/image", service.activate_recipe_image, methods=["PUT"]
)
router.add_api_route(
    "/recipes/{recipe_id}/image", service.remove_recipe_image, methods=["DELETE"]
)
