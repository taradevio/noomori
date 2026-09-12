from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    recipe_html_transport: Literal["urllib3", "curl_cffi"] = "curl_cffi"

    supabase_url: str
    supabase_key: str
    # NOTE: Push credentials are server-only and must never use EXPO_PUBLIC_* names.
    supabase_service_role_key: SecretStr | None = None
    expo_access_token: SecretStr | None = None
    household_join_code_hmac_key: SecretStr = Field(min_length=32)

    sentry_dsn: SecretStr | None = None
    sentry_release: str | None = None
    sentry_traces_sample_rate: float = Field(default=0.1, ge=0, le=1)
    sentry_profiles_sample_rate: float = Field(default=0.1, ge=0, le=1)

    cors_origins: list[str] = [
        "http://localhost:8081",
        "http://localhost:19006",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
