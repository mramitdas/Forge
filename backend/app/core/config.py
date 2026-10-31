import os
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_file() -> str:
    """Pick the env file to load.

    `GYM_ENV_FILE` names the file explicitly (e.g. `.env.production`).
    For backwards compatibility a filename passed via `GYM_ENVIRONMENT`
    (`.env` / `.env.production`) is honoured too. Any other value (e.g. the
    `test` marker set by pytest) falls back to `.env`. Process environment
    variables always override file values.
    """
    explicit = os.environ.get("GYM_ENV_FILE", "")
    if explicit:
        return explicit
    value = os.environ.get("GYM_ENVIRONMENT", "")
    return value if value.startswith(".env") else ".env"


def _semantic_environment(raw: str) -> str:
    """Map `GYM_ENVIRONMENT` to a deployment stage.

    Historically `GYM_ENVIRONMENT` selected the env *file*. That meaning now
    lives on `GYM_ENV_FILE`; when a filename is still supplied here it is
    translated to the matching stage so existing deployments keep working.
    """
    name = (raw or "").strip()
    if not name:
        return "development"
    if name.startswith(".env"):
        return "production" if "prod" in name else "development"
    return name


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

    @field_validator("environment", mode="before")
    @classmethod
    def _normalize_environment(cls, value: object) -> str:
        return _semantic_environment(str(value) if value is not None else "")

    database_url: str = Field(
        default="postgresql+asyncpg://gym:gym_dev_pass@127.0.0.1:5432/gym_erp"
    )

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

    auth_rate_limit_per_minute: int = 20
    auth_rate_limit_window_seconds: int = 60

    outbox_poll_interval_seconds: float = 1.0
    outbox_max_deliveries: int = 5
    renewal_interval_seconds: float = 30.0
    media_dir: str = "media"

    @property
    def is_platform_scope(self) -> bool:
        return bool(self.platform_tenant_id)

    @property
    def is_production(self) -> bool:
        return self.environment in {"production", "prod", "staging", "stag"}


def validate_runtime_settings(settings: Settings) -> None:
    """Fail fast on unsafe production configuration.

    Development and test keep the convenience fallbacks; production must
    supply signing material and must not point at the local dev database.
    """
    if not settings.is_production:
        return
    has_keypair = bool(settings.jwt_private_key and settings.jwt_public_key)
    if not has_keypair and not settings.jwt_hmac_secret:
        raise RuntimeError(
            "Production requires GYM_JWT_HMAC_SECRET or an ES256 keypair "
            "(GYM_JWT_PRIVATE_KEY + GYM_JWT_PUBLIC_KEY)"
        )
    if not has_keypair and len(settings.jwt_hmac_secret) < 32:
        raise RuntimeError("GYM_JWT_HMAC_SECRET must be at least 32 characters in production")
    if "gym_dev_pass" in settings.database_url or "@127.0.0.1" in settings.database_url:
        raise RuntimeError("Production must not use the local development database URL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
