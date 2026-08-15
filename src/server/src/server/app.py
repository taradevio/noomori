from fastapi import FastAPI

from server.modules.health import router as health_router


def create_app() -> FastAPI:
    application = FastAPI(title="Noomori API", version="1.0.0")
    application.include_router(health_router, prefix="/api/v1")
    return application


app = create_app()
