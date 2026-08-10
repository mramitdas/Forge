from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import AuditMixin, Base, TenantRowMixin, uuid7

CHECKIN_SOURCES = ("manual", "qr", "kiosk", "rfid", "biometric")
CHECKIN_RESULTS = ("allowed", "denied", "duplicate")


class CheckIn(TenantRowMixin, AuditMixin, Base):
    __tablename__ = "check_ins"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    member_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("members.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    result: Mapped[str] = mapped_column(String(16), default="allowed", nullable=False)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
