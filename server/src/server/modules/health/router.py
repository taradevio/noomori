from fastapi import APIRouter


router = APIRouter(
    prefix="/health",
    tags=["Health"],
)


# Purpose: Return the API's basic liveness status.
# Connects to: The versioned health router registered by the application factory.
@router.get("")
async def health_check():
    return {
        "status": "ok",
    }
