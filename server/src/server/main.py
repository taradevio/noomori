import logging

import sentry_sdk
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.logging import LoggingIntegration

from server.config import Settings, settings
from server.core.lifespan import app_lifespan
from server.modules.cookbooks.router import router as cookbook_router
from server.modules.health.router import router as health_router
from server.modules.households.router import router as household_router
from server.modules.notifications.router import router as notification_router
from server.modules.recipes.router import router as recipe_router


__all__ = ["app", "create_app", "main"]


logger = logging.getLogger(__name__)


def _initialize_sentry(config: Settings) -> None:
    if config.app_env not in {"staging", "production"}:
        return
    if not config.sentry_dsn:
        logger.warning("Sentry is disabled because SENTRY_DSN is not configured")
        return

    sentry_sdk.init(
        dsn=config.sentry_dsn.get_secret_value(),
        environment=config.app_env,
        release=config.sentry_release,
        traces_sample_rate=config.sentry_traces_sample_rate,
        profiles_sample_rate=config.sentry_profiles_sample_rate,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        integrations=[
            LoggingIntegration(
                level=logging.WARNING,
                event_level=logging.ERROR,
                sentry_logs_level=logging.WARNING,
                capture_sentry_logs=True,
            )
        ],
    )


# Purpose: Assemble the FastAPI application, middleware, lifespan, and routers.
# Connects to: Called by server/src/server/main.py's module-level app initialization; registers server/src/server/core/lifespan.py::app_lifespan(), server/src/server/modules/health/router.py::health_check(), and handlers attached through server/src/server/modules/cookbooks/router.py::router.add_api_route(), server/src/server/modules/households/router.py::router.add_api_route(), server/src/server/modules/notifications/router.py::router.add_api_route(), and server/src/server/modules/recipes/router.py::router.add_api_route().
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


_initialize_sentry(settings)
app = create_app()


# Purpose: Launch the local Uvicorn development server for the assembled application.
# Connects to: Called by server/pyproject.toml's server script; serves the module-level app created by server/src/server/main.py::create_app() through uvicorn.run().
def main() -> None:
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
