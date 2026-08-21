import uvicorn
import logging

from fastapi import FastAPI, HTTPException, Depends
from dataclasses import dataclass
from datetime import datetime, timezone
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from server.api.health import router as health_router
from server.config import settings
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
security = HTTPBearer()
logger = logging.getLogger(__name__)

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


@dataclass
class AuthContext:
    # Keep the verified user and their request-scoped Supabase client together so
    # route handlers cannot accidentally issue database calls as an anonymous user.
    user: object
    supabase: Client

class CreateHousehold(BaseModel):
    name: str = Field(min_length=1, max_length=100)


def get_supabase() -> Client:
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase credentials are missing")

    # The publishable key does not bypass RLS. The caller's access token is
    # attached below so PostgREST evaluates policies as that authenticated user.
    return create_client(settings.supabase_url, settings.supabase_key)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> AuthContext:
    access_token = credentials.credentials
    supabase = get_supabase()

    # Validate the bearer token with Supabase Auth before using its identity in
    # application logic or forwarding it to the database API.
    response = supabase.auth.get_user(access_token)

    if not response.user:
        raise HTTPException(status_code=401, detail="Invalid Authentication")

    # Forward the same JWT to PostgREST. This supplies auth.uid() for RLS; it
    # authenticates the request but intentionally does not bypass any policy.
    supabase.postgrest.auth(access_token)

    return AuthContext(user=response.user, supabase=supabase)


# Create the household, establish its first owner, and complete onboarding.
# NOTE: These are separate PostgREST requests, so a later failure does not roll
# back an earlier write. Move this workflow into a database RPC if it must be atomic.
@app.post("/household")
async def create_household(payload: CreateHousehold, auth: AuthContext = Depends(get_current_user)):
    supabase = auth.supabase
    user_id = auth.user.id
    try:
        logger.info(
            "Creating household for user_id=%s",
            user_id,
        )
        # supabase-py returns the inserted row by default. The row must therefore
        # satisfy both the households INSERT policy and its SELECT policy.
        household_response = (
            supabase
            .table("households")
            .insert({
                "name": payload.name,
                "created_by": user_id,
            })
            .execute()
        )

        household = household_response.data[0]
        household_id = household["id"]

        logger.info(
            "Household created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        # The bootstrap policy must allow the creator to add their own initial
        # owner membership. Returning it also requires a matching SELECT policy.
        member_response = (
            supabase
            .table("household_members")
            .insert({
                "household_id": household_id,
                "user_id": user_id,
                "role": "owner",
            })
            .execute()
        )

        logger.info(
            "Owner membership created household_id=%s user_id=%s",
            household_id,
            user_id,
        )

        date_now = datetime.now(timezone.utc).isoformat()

        # Scope the update to the authenticated user's profile; the profiles
        # SELECT and UPDATE policies must permit the same user-owned row.
        onboarding_response = (
            supabase
            .table("profiles")
            .update({
                "onboarding_completed_at": date_now,
                "updated_at": date_now,
            })
            .eq("id", user_id)
            .execute()
        )

        logger.info(
            "Onboarding completed user_id=%s household_id=%s",
            user_id,
            household_id,
        )

        return {
            "household": household,
            "membership": member_response.data[0],
            "profile": onboarding_response.data[0],
        }

    except Exception as exc:
        logger.exception(
            "Failed to create household user_id=%s",
            user_id,
        )
        raise HTTPException(status_code=500, detail=str(exc),) from exc

def main() -> None:
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
