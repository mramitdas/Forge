from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import AuditMixin, Base, SoftDeleteMixin, TenantRowMixin, uuid7

EXPENSE_METHODS = ("cash", "upi", "card", "netbanking", "wallet", "other")


class Expense(TenantRowMixin, AuditMixin, SoftDeleteMixin, Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    # null = gym-level expense (rent, utilities) not tied to one branch
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("branches.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    method: Mapped[str] = mapped_column(String(20), default="cash", nullable=False)
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
