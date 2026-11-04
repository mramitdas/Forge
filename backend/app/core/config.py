import os
from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_file() -> str:
    """Pick the env file to load.

    `GYM_ENV_FILE` names the file explicitly (e.g. `.env.production`).
    Defaults to `.env`. Process environment variables always override file
    values.
    """
    explicit = os.environ.get("GYM_ENV_FILE", "")
    if explicit:
        return explicit
    return ".env"


def _semantic_environment(raw: str) -> str:
    """Map `GYM_ENVIRONMENT` to a deployment stage.

    `GYM_ENVIRONMENT` selects the deployment stage (`development`, `test`,
    `production`). For backwards compatibility a filename like `.env` or
    `.env.production` is still honoured — the `.env` prefix is stripped and
    the remainder is used as the stage name.
    """
    name = (raw or "").strip()
    if not name:
        return "development"
    if name.startswith(".env."):
        name = name[5:]
    elif name == ".env":
        name = ""
    return name if name in ("development", "test", "production") else "development"


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

    @model_validator(mode="after")
    def _shard_index_within_count(self) -> "Settings":
        if self.outbox_shard_index >= self.outbox_shard_count:
            raise ValueError("outbox_shard_index must be smaller than outbox_shard_count")
        return self

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
    # Multi-instance dispatch: each instance handles the aggregate-id shard
    # `hash % shard_count == shard_index`. Defaults to a single shard, which is
    # equivalent to today's unpinned behavior.
    outbox_shard_count: int = Field(default=1, ge=1)
    outbox_shard_index: int = Field(default=0, ge=0)
    # A claimed event is invisible to other instances until the lease expires,
    # so a dead instance's events get reclaimed after this window.
    outbox_lease_seconds: float = 90.0
    renewal_interval_seconds: float = 30.0
    media_dir: str = "media"

    @property
    def is_platform_scope(self) -> bool:
        return bool(self.platform_tenant_id)

    @property
    def is_production(self) -> bool:
        return self.environment in {"production", "prod"}


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
    if any(host in settings.database_url for host in ("127.0.0.1", "localhost", "::1")):
        raise RuntimeError("Production must not use the local development database URL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
