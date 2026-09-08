from fastapi import APIRouter


router = APIRouter(
    prefix="/health",
    tags=["Health"],
)


# Purpose: Return the API's basic liveness status.
# Connects to: Registered by server/src/server/modules/health/router.py::router.get() and included by server/src/server/main.py::create_app(); has no downstream local function calls.
@router.get("")
async def health_check():
    return {
        "status": "ok",
    }
