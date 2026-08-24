from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    AuditMixin,
    Base,
    SoftDeleteMixin,
    TenantRowMixin,
    VersionMixin,
    uuid7,
)


class MembershipPlan(TenantRowMixin, AuditMixin, SoftDeleteMixin, VersionMixin, Base):
    __tablename__ = "membership_plans"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )  # null = common plan available at every branch
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    billing_period: Mapped[str] = mapped_column(
        String(20), default="monthly", nullable=False
    )  # monthly | quarterly | annual
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_fee_minor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tax_rate_bp: Mapped[int] = mapped_column(Integer, default=1800, nullable=False)  # 18% = 1800 bp
    duration_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


SUBSCRIPTION_STATUSES = ("pending", "active", "frozen", "expired", "cancelled")


class Subscription(TenantRowMixin, AuditMixin, SoftDeleteMixin, VersionMixin, Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    member_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("members.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("membership_plans.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, index=True
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    price_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
