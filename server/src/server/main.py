import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from server.api.health import router as health_router
from server.config import settings

app = FastAPI(
    title="Noomori API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    health_router,
    prefix="/api/v1",
)

class CreateHousehold(BaseModel):
    name: str

# insert household, member role, and update onboarding
@app.post("/household")
async def create_household(payload: CreateHousehold):
    
    
    print(f"Household's name {payload}")

def main() -> None:
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )