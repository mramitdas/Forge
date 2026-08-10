from __future__ import annotations

import time
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def uuid7() -> uuid.UUID:
    """Time-ordered UUIDv7 per RFC 9562.

    Sortable (timestamp-prefixed) so index locality is good at high write volume,
    unguessable, and safe to generate client-side.
    """
    now_ms = int(time.time() * 1000)
    rand = uuid.uuid4().int & ((1 << 74) - 1)  # 74 random bits
    value = (
        (now_ms << 80)
        | (0x7 << 76)  # version 7
        | ((rand >> 62) << 64)  # rand_a (12 bits)
        | (0x2 << 62)  # variant 10
        | (rand & ((1 << 62) - 1))  # rand_b (62 bits)
    )
    return uuid.UUID(int=value)


class TenantRowMixin:
    """Every tenant-scoped table carries tenant_id with a hard DB default.

    The default reads the transaction-local `app.tenant_id` setting, so a row can
    never be created without a tenant, and a forgotten application filter is caught
    by RLS rather than silently widened.
    """

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        nullable=False,
        index=True,
        server_default=text("NULLIF(current_setting('app.tenant_id', true), '')::uuid"),
    )


class AuditMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)


class VersionMixin:
    version: Mapped[int] = mapped_column(default=1, nullable=False)


class ULIDColumnMixin:
    """Optional stable string identifier for user-facing codes (e.g., member_no)."""

    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
