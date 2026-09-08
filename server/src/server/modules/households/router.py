from fastapi import APIRouter

from server.modules.households import service


router = APIRouter()
router.add_api_route("/household", service.get_household_settings, methods=["GET"])
router.add_api_route("/household", service.create_household, methods=["POST"])
router.add_api_route(
    "/household", service.leave_household, methods=["DELETE"], status_code=204
)
router.add_api_route(
    "/household/activity", service.get_household_activity, methods=["GET"]
)
router.add_api_route(
    "/household/activity/read",
    service.mark_household_activity_read,
    methods=["PUT"],
    status_code=204,
)
router.add_api_route(
    "/household/invite", service.replace_household_join_code, methods=["POST"]
)
router.add_api_route(
    "/household/invite",
    service.revoke_household_join_code,
    methods=["DELETE"],
    status_code=204,
)
router.add_api_route(
    "/household/join/preview",
    service.preview_household_join_code,
    methods=["POST"],
)
router.add_api_route(
    "/household/join", service.join_household_with_code, methods=["POST"]
)
