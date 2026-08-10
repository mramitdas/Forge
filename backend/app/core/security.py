from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings
from app.core.errors import UnauthenticatedError

_hasher = PasswordHasher(time_cost=2, memory_cost=19 * 1024, parallelism=1)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def _algorithm(settings) -> str:
    if settings.jwt_private_key and settings.jwt_public_key:
        return settings.jwt_algorithm
    return "HS256"


def _signing_key(settings):
    if settings.jwt_private_key:
        return settings.jwt_private_key.encode()
    return _hmac_secret(settings).encode()


def _verifying_key(settings):
    if settings.jwt_public_key:
        return settings.jwt_public_key.encode()
    return _hmac_secret(settings).encode()


# Development-only fallback when no asymmetric keypair is configured. Production
# deployments MUST set GYM_JWT_PRIVATE_KEY/GYM_JWT_PUBLIC_KEY (ES256) or a strong
# GYM_JWT_HMAC_SECRET through environment configuration.
_DEV_HMAC_SECRET = "dev-only-insecure-secret-change-me"  # noqa: S105


def _hmac_secret(settings) -> str:
    return getattr(settings, "jwt_hmac_secret", "") or _DEV_HMAC_SECRET


def create_token(
    *,
    subject: str,
    token_type: str,
    ttl_seconds: int,
    claims: dict[str, Any] | None = None,
) -> tuple[str, datetime]:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
        "iss": settings.issuer,
        "jti": secrets.token_urlsafe(16),
    }
    if claims:
        payload.update(claims)
    token = jwt.encode(payload, _signing_key(settings), algorithm=_algorithm(settings))
    return token, now + timedelta(seconds=ttl_seconds)


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            _verifying_key(settings),
            algorithms=[_algorithm(settings)],
            issuer=settings.issuer,
            options={"require": ["exp", "iat", "sub", "jti"]},
        )
    except jwt.InvalidTokenError as exc:
        raise UnauthenticatedError("Invalid or expired token", code="INVALID_TOKEN") from exc
    if payload.get("type") != expected_type:
        raise UnauthenticatedError("Wrong token type", code="INVALID_TOKEN_TYPE")
    return payload


def create_access_token(
    *, user_id: str, tenant_id: str | None, claims: dict[str, Any] | None = None
) -> tuple[str, datetime]:
    settings = get_settings()
    access_claims = {"tenant_id": tenant_id}
    if claims:
        access_claims.update(claims)
    return create_token(
        subject=user_id,
        token_type="access",  # noqa: S106 -- token_type is a JWT claim name, not a secret
        ttl_seconds=settings.access_token_ttl_seconds,
        claims=access_claims,
    )
