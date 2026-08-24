from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    AuditMixin,
    Base,
    SoftDeleteMixin,
    TenantRowMixin,
    VersionMixin,
    uuid7,
)


class Gym(TenantRowMixin, AuditMixin, SoftDeleteMixin, VersionMixin, Base):
    """A gym is a tenant. tenant_id equals the gym's own id, so every row across
    all tenant-scoped tables shares one namespace for isolation."""

    __tablename__ = "gyms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="trial", nullable=False)
    tier_code: Mapped[str] = mapped_column(String(40), default="starter", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    cross_branch_access: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    settings: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)


class Branch(TenantRowMixin, AuditMixin, SoftDeleteMixin, VersionMixin, Base):
    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    gym_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("gyms.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SubscriptionTier(Base):
    """Global platform catalog of SaaS tiers and their entitlements."""

    __tablename__ = "subscription_tiers"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    max_branches: Mapped[int | None] = mapped_column(nullable=True)
    max_members: Mapped[int | None] = mapped_column(nullable=True)
    limits: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )


class GymSubscriptionEvent(Base):
    """Platform-level audit of who provisioned / changed a gym's subscription."""

    __tablename__ = "gym_subscription_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    gym_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    from_tier_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_tier_code: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TenantEntitlement(TenantRowMixin, AuditMixin, Base):
    """Which tier a gym currently has and for how long."""

    __tablename__ = "tenant_entitlements"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    gym_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("gyms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tier_code: Mapped[str] = mapped_column(String(40), nullable=False)
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
