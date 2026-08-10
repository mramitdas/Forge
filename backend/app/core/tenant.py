from __future__ import annotations

import uuid
from contextvars import ContextVar
from dataclasses import dataclass

from app.core.errors import UnauthenticatedError


@dataclass(frozen=True)
class TenantContext:
    tenant_id: uuid.UUID | None
    platform_scope: bool = False


_current: ContextVar[TenantContext | None] = ContextVar("tenant_context", default=None)


def get_tenant_context() -> TenantContext | None:
    return _current.get()


def require_tenant_context() -> TenantContext:
    ctx = _current.get()
    if ctx is None:
        raise UnauthenticatedError("No tenant context", code="NO_TENANT_CONTEXT")
    return ctx


def set_tenant_context(ctx: TenantContext | None) -> TenantContext | None:
    token = _current.set(ctx)
    return token


def reset_tenant_context(token) -> None:
    _current.reset(token)
