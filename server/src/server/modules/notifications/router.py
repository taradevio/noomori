from fastapi import APIRouter

from server.modules.notifications import service


router = APIRouter()
router.add_api_route(
    "/notifications/device",
    service.register_notification_device,
    methods=["PUT"],
    status_code=204,
)
router.add_api_route(
    "/notifications/device",
    service.unregister_notification_device,
    methods=["DELETE"],
    status_code=204,
)
