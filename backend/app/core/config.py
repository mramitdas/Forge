import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_file() -> str:
    """Pick the env file from `GYM_ENVIRONMENT`.

    Set `GYM_ENVIRONMENT=.env` (default) for local dev or
    `GYM_ENVIRONMENT=.env.production` to load production values. Any other
    value (e.g. the `test` marker set by pytest) falls back to `.env`.
    Process environment variables still override file values.
    """
    value = os.environ.get("GYM_ENVIRONMENT", "")
    return value if value.startswith(".env") else ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file(),
        env_prefix="GYM_",
        extra="ignore",
    )

    app_name: str = "Gym ERP"
    environment: str = "development"
    debug: bool = False
    api_prefix: str = "/api/v1"

    database_url: str = Field(
        default="postgresql+asyncpg://gym:gym_dev_pass@127.0.0.1:5432/gym_erp"
    )
    redis_url: str | None = None

    jwt_algorithm: str = "ES256"
    jwt_private_key: str = ""
    jwt_public_key: str = ""
    jwt_hmac_secret: str = ""
    access_token_ttl_seconds: int = 15 * 60
    refresh_token_ttl_seconds: int = 30 * 24 * 3600
    issuer: str = "gym-erp"

    platform_tenant_id: str = "00000000-0000-0000-0000-000000000000"
    platform_admin_email: str = ""
    platform_admin_password: str = ""
    allowed_origins: list[str] = ["http://localhost:3000"]
    cors_allow_credentials: bool = True

    outbox_poll_interval_seconds: float = 1.0
    outbox_max_deliveries: int = 5
    renewal_interval_seconds: float = 30.0
    media_dir: str = "media"

    @property
    def is_platform_scope(self) -> bool:
        return bool(self.platform_tenant_id)


@lru_cache
def get_settings() -> Settings:
    return Settings()
