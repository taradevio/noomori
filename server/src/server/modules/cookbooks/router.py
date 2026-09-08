from fastapi import APIRouter

from server.modules.cookbooks import service


router = APIRouter()
router.add_api_route("/cookbooks", service.list_cookbooks, methods=["GET"])
router.add_api_route("/cookbooks", service.create_cookbook, methods=["POST"])
router.add_api_route(
    "/cookbooks/{cookbook_id}", service.get_cookbook, methods=["GET"]
)
router.add_api_route(
    "/cookbooks/{cookbook_id}", service.rename_cookbook, methods=["PUT"]
)
router.add_api_route(
    "/cookbooks/{cookbook_id}/recipes",
    service.replace_cookbook_recipes,
    methods=["PUT"],
)
router.add_api_route(
    "/cookbooks/{cookbook_id}",
    service.delete_cookbook,
    methods=["DELETE"],
    status_code=204,
)
