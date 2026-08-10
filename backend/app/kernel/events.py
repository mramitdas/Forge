"""Transactional outbox + in-process event bus.

Any business-critical side effect (email, SMS, gateway callback, notification,
projection update) is emitted as a domain event written to the outbox *inside the
same DB transaction* that changed state. A dispatcher later delivers events to
registered handlers in the event's tenant context. This guarantees no lost events
on crash; delivery is at-least-once, so handlers must be idempotent.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, Uuid, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.logging import get_logger
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.base import Base
from app.db.session import get_sessionmaker

logger = get_logger(__name__)

Handler = Callable[
    [AsyncSession, str, str, str, dict[str, Any]], Awaitable[None]
]  # (session, aggregate_type, aggregate_id, event_type, payload)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    aggregate_type: Mapped[str] = mapped_column(String(64), nullable=False)
    aggregate_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class EventBus:
    """Registry of in-process handlers keyed by event type."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = {}

    def register(self, event_type: str, handler: Handler) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def emit(
        self,
        session: AsyncSession,
        *,
        tenant_id: uuid.UUID | None,
        aggregate_type: str,
        aggregate_id: uuid.UUID,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        session.add(
            OutboxEvent(
                tenant_id=tenant_id,
                aggregate_type=aggregate_type,
                aggregate_id=aggregate_id,
                event_type=event_type,
                payload=payload,
            )
        )


bus = EventBus()


class Dispatcher:
    """Polls the outbox and delivers events to handlers in the event's tenant context."""

    def __init__(self, batch_size: int = 100) -> None:
        self.batch_size = batch_size

    async def run_once(self) -> int:
        maker = get_sessionmaker()
        async with maker() as session:
            await session.begin()
            rows = (
                await session.execute(
                    select(OutboxEvent)
                    .where(OutboxEvent.published_at.is_(None))
                    .order_by(OutboxEvent.created_at.asc())
                    .limit(self.batch_size)
                    .with_for_update(skip_locked=True)
                )
            ).scalars().all()
            pending = [(row.id, row.tenant_id) for row in rows]
            await session.commit()
            for event_id, tenant_id in pending:
                await self._deliver(event_id, tenant_id)
        return len(pending)

    async def _deliver(self, event_id: uuid.UUID, tenant_id: uuid.UUID | None) -> None:
        # The tenant context must be set BEFORE begin(), because begin() stamps the
        # transaction-local RLS settings from the current context.
        token = set_tenant_context(TenantContext(tenant_id=tenant_id, platform_scope=False))
        maker = get_sessionmaker()
        try:
            async with maker() as session:
                await session.begin()
                event = await session.get(OutboxEvent, event_id)
                if event is None or event.published_at is not None:
                    await session.commit()
                    return
                handlers = bus._handlers.get(event.event_type, [])
                for handler in handlers:
                    await handler(
                        session,
                        event.aggregate_type,
                        str(event.aggregate_id),
                        event.event_type,
                        event.payload,
                    )
                event.published_at = datetime.now(UTC)
                event.attempts += 1
                await session.commit()
        except Exception:
            logger.exception(
                "outbox delivery failed",
                event_id=str(event_id),
            )
            async with maker() as fail_session:
                await fail_session.begin()
                row = await fail_session.get(OutboxEvent, event_id)
                if row is not None:
                    row.attempts += 1
                    row.last_error = "delivery failed"
                    await fail_session.commit()
        finally:
            reset_tenant_context(token)

    async def run_forever(self, interval_seconds: float = 1.0) -> None:
        while True:
            try:
                await self.run_once()
            except Exception:
                logger.exception("outbox dispatcher loop error")
            await asyncio.sleep(interval_seconds)
