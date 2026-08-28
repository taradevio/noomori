from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"

    supabase_url: str
    supabase_key: str
    household_join_code_hmac_key: SecretStr = Field(min_length=32)

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
