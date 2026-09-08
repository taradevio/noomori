import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from server.core.database import get_supabase


logger = logging.getLogger(__name__)
security = HTTPBearer()


@dataclass
class AuthContext:
    user: object
    supabase: Client


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthContext:
    access_token = credentials.credentials
    supabase = get_supabase(access_token)

    try:
        response = supabase.auth.get_user(access_token)
    except Exception as exc:
        logger.warning("Authentication failed", exc_info=True)
        raise HTTPException(status_code=401, detail="Invalid Authentication") from exc

    if not response.user:
        logger.warning("Authentication returned no user")
        raise HTTPException(status_code=401, detail="Invalid Authentication")

    supabase.postgrest.auth(access_token)
    return AuthContext(user=response.user, supabase=supabase)
