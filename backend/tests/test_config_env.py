"""Configuration hardening: env-file selection, stage semantics, prod validation."""

from __future__ import annotations

import pytest
from app.core.config import (
    Settings,
    _env_file,
    _env_stage,
    validate_runtime_settings,
)


def test_env_stage_derived_from_filename():
    assert _env_stage(".env.production") == "production"
    assert _env_stage(".env.prod") == "production"
    assert _env_stage(".env.test") == "test"
    assert _env_stage(".env") == "development"
    assert _env_stage(".env.local") == "development"
    assert _env_stage("") == "development"


def test_env_stage_is_read_from_gym_env_file(monkeypatch):
    monkeypatch.setenv("GYM_ENV_FILE", ".env.production")
    assert Settings().environment == "production"

    monkeypatch.setenv("GYM_ENV_FILE", ".env.local")
    assert Settings().environment == "development"

    monkeypatch.delenv("GYM_ENV_FILE", raising=False)
    assert Settings().environment == "development"

    # An explicit environment value always wins over the file name.
    monkeypatch.setenv("GYM_ENV_FILE", ".env")
    assert Settings(environment="production").environment == "production"


def test_env_file_prefers_gym_env_file(monkeypatch):
    monkeypatch.setenv("GYM_ENV_FILE", ".env.production")
    assert _env_file() == ".env.production"


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
            cron_secret="cron-secret-32-a" + "a" * 21,
        )
    )


def test_development_never_rejected():
    validate_runtime_settings(Settings(environment="development"))


def test_production_missing_cron_secret_rejected():
    with pytest.raises(RuntimeError):
        validate_runtime_settings(
            Settings(
                environment="production",
                jwt_hmac_secret="a" * 32,
                database_url="postgresql+asyncpg://postgres:p@supabase.co/postgres",
            )
        )


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
