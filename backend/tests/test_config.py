"""Tests for settings normalisation and production validation."""

import pytest
from app.core.config import (
    Settings,
    _env_file,
    _semantic_environment,
    validate_runtime_settings,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("", "development"),
        ("development", "development"),
        ("production", "production"),
        ("prod", "prod"),
        ("staging", "staging"),
        ("stag", "stag"),
        ("test", "test"),
        (".env", "development"),
        (".env.production", "production"),
    ],
)
def test_semantic_environment(raw, expected):
    assert _semantic_environment(raw) == expected


def test_env_file_selection(monkeypatch):
    monkeypatch.delenv("GYM_ENV_FILE", raising=False)
    monkeypatch.delenv("GYM_ENVIRONMENT", raising=False)
    assert _env_file() == ".env"

    monkeypatch.setenv("GYM_ENVIRONMENT", ".env.production")
    assert _env_file() == ".env.production"

    monkeypatch.setenv("GYM_ENV_FILE", ".env.production")
    monkeypatch.setenv("GYM_ENVIRONMENT", "test")
    assert _env_file() == ".env.production"


def _settings(**overrides):
    base = dict(
        environment="production",
        database_url="postgresql+asyncpg://gym:pw@aws-0-x.pooler.supabase.com:5432/postgres?ssl=require",
        jwt_hmac_secret="a-strong-secret-that-is-at-least-32-chars-long!",
    )
    base.update(overrides)
    return Settings(**base)


def test_validate_passes_production_strong_secret():
    settings = _settings()
    validate_runtime_settings(settings)  # must not raise


def test_validate_passes_production_keypair():
    settings = _settings(
        jwt_hmac_secret="",
        jwt_private_key="-----BEGIN EC PRIVATE KEY-----\nfake",
        jwt_public_key="-----BEGIN PUBLIC KEY-----\nfake",
    )
    validate_runtime_settings(settings)


def test_validate_raises_production_no_secret():
    settings = _settings(jwt_hmac_secret="", jwt_private_key="", jwt_public_key="")
    with pytest.raises(RuntimeError):
        validate_runtime_settings(settings)


def test_validate_raises_production_weak_secret():
    settings = _settings(jwt_hmac_secret="short")
    with pytest.raises(RuntimeError):
        validate_runtime_settings(settings)


def test_validate_raises_production_dev_database():
    settings = _settings(
        database_url="postgresql+asyncpg://postgres:pw@127.0.0.1:5432/postgres",
    )
    with pytest.raises(RuntimeError):
        validate_runtime_settings(settings)


def test_non_production_never_raises():
    for env in ("development", "test"):
        settings = Settings(environment=env, jwt_hmac_secret="")
        validate_runtime_settings(settings)
