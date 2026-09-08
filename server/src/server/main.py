import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.api.health import router as health_router
from server.config import settings
from server.core.lifespan import app_lifespan
from server.modules.cookbooks.router import router as cookbook_router
from server.modules.households.router import router as household_router
from server.modules.notifications.router import router as notification_router
from server.modules.recipes.router import router as recipe_router


__all__ = ["app", "create_app", "main"]


def create_app() -> FastAPI:
    app = FastAPI(
        title="Noomori API",
        version="0.1.0",
        lifespan=app_lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(recipe_router)
    app.include_router(cookbook_router)
    app.include_router(household_router)
    app.include_router(notification_router)
    return app


app = create_app()


def main() -> None:
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
