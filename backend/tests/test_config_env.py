"""Configuration hardening: env-file selection, stage semantics, prod validation."""

from __future__ import annotations

import pytest
from app.core.config import (
    Settings,
    _env_file,
    _semantic_environment,
    validate_runtime_settings,
)


def test_semantic_environment_maps_filenames_and_strings():
    assert _semantic_environment(".env") == "development"
    assert _semantic_environment(".env.production") == "production"
    assert _semantic_environment("production") == "production"
    assert _semantic_environment("staging") == "staging"
    assert _semantic_environment("") == "development"
    assert _semantic_environment("development") == "development"


def test_env_file_prefers_gym_env_file(monkeypatch):
    monkeypatch.delenv("GYM_ENV_FILE", raising=False)
    monkeypatch.setenv("GYM_ENVIRONMENT", ".env.production")
    assert _env_file() == ".env.production"

    monkeypatch.setenv("GYM_ENV_FILE", ".env")
    monkeypatch.delenv("GYM_ENVIRONMENT", raising=False)
    assert _env_file() == ".env"


def test_production_weak_hmac_rejected():
    with pytest.raises(RuntimeError):
        validate_runtime_settings(
            Settings(environment="production", jwt_hmac_secret="short")
        )


def test_production_strong_hmac_accepted():
    validate_runtime_settings(
        Settings(
            environment="production",
            jwt_hmac_secret="a" * 32,
            database_url="postgresql+asyncpg://postgres:p@supabase.co/postgres",
        )
    )


def test_development_never_rejected():
    validate_runtime_settings(Settings(environment="development"))


def test_production_dev_db_rejected():
    with pytest.raises(RuntimeError):
        validate_runtime_settings(
            Settings(
                environment="production",
                jwt_hmac_secret="a" * 32,
                database_url="postgresql+asyncpg://gym:gym_dev_pass@127.0.0.1:5432/gym_erp",
            )
        )


@pytest.fixture(autouse=True)
def _no_env_file_pollution(monkeypatch):
    monkeypatch.delenv("GYM_ENV_FILE", raising=False)
    monkeypatch.delenv("GYM_ENVIRONMENT", raising=False)
