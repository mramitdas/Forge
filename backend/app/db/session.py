from __future__ import annotations

import ssl
import uuid
from collections.abc import AsyncIterator
from urllib.parse import parse_qs, urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncSessionTransaction,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.tenant import TenantContext, get_tenant_context

logger = get_logger(__name__)

_engine = None
_sessionmaker: async_sessionmaker[TenantAwareSession] | None = None


def _ssl_connect_args(database_url: str) -> dict:
    """Managed Postgres (Supabase, RDS, …) requires TLS. Honour
    `?ssl=require` / `?sslmode=require` in the URL by handing asyncpg a
    default SSL context; local dev URLs without the flag stay plain."""
    query = parse_qs(urlparse(database_url).query)
    mode = (query.get("ssl") or query.get("sslmode") or [""])[0].lower()
    if mode in ("verify-ca", "verify-full"):
        return {"ssl": ssl.create_default_context()}
    if mode in ("require", "prefer"):
        # libpq "require" encrypts but does not verify the CA chain. Managed
        # poolers (e.g. Supabase Supavisor) present a self-signed chain that
        # strict verification rejects; honour the documented semantics.
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return {"ssl": ctx}
    return {}


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            echo=False,
            connect_args=_ssl_connect_args(settings.database_url),
        )
    return _engine


def get_sessionmaker() -> async_sessionmaker[TenantAwareSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            get_engine(),
            class_=TenantAwareSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _sessionmaker


class TenantAwareSession(AsyncSession):
    """Session that pins transaction-local tenant settings on begin.

    Every transaction started on this session stamps `app.tenant_id` and
    `app.platform_scope` so that RLS policies and the tenant_id column default
    are consistent for the entire transaction.
    """

    async def begin(self) -> AsyncSessionTransaction:  # type: ignore[override]
        transaction = await super().begin()
        await self._stamp_tenant()
        return transaction

    async def _stamp_tenant(self) -> None:
        ctx: TenantContext | None = get_tenant_context()
        tenant_id = ctx.tenant_id if ctx is not None else None
        platform_scope = ctx.platform_scope if ctx is not None else False
        # Always write both settings, even when the caller has no context. A GUC
        # created by set_config resets to '' (not NULL) after the transaction, and
        # pooled connections would otherwise feed a stale value (or a stale
        # platform_scope) into the next request's RLS policy.
        if tenant_id is not None:
            await self.execute(
                text("SELECT set_config('app.tenant_id', :v, true)"),
                {"v": str(tenant_id)},
            )
        else:
            await self.execute(text("SELECT set_config('app.tenant_id', '', true)"))
        await self.execute(
            text("SELECT set_config('app.platform_scope', :v, true)"),
            {"v": "on" if platform_scope else "off"},
        )


async def get_session() -> AsyncIterator[TenantAwareSession]:
    """Request-scoped session. Tenant context must be set before use."""
    maker = get_sessionmaker()
    async with maker() as session:
        await session.begin()
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


async def get_platform_session() -> AsyncIterator[TenantAwareSession]:
    """Session for platform-scope operations (login, provisioning)."""
    settings = get_settings()
    old = get_tenant_context()
    from app.core.tenant import set_tenant_context

    token = set_tenant_context(
        TenantContext(
            tenant_id=uuid.UUID(settings.platform_tenant_id),
            platform_scope=True,
        )
    )
    try:
        maker = get_sessionmaker()
        async with maker() as session:
            await session.begin()
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
            else:
                await session.commit()
    finally:
        from app.core.tenant import reset_tenant_context

        reset_tenant_context(token)
        if old is not None:
            from app.core.tenant import set_tenant_context

            set_tenant_context(old)
