from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models import Invoice
from app.modules.identity.models import User
from app.modules.notifications.models import InAppNotification


class NotificationOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    body: str | None
    type: str
    payload: dict
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


async def create_notification(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    title: str,
    body: str | None,
    type: str = "info",
    payload: dict | None = None,
) -> InAppNotification:
    notification = InAppNotification(
        user_id=user_id,
        title=title,
        body=body,
        type=type,
        payload=payload or {},
    )
    session.add(notification)
    await session.flush()
    return notification


async def list_for_user(
    session: AsyncSession, *, user_id: uuid.UUID, limit: int = 50
) -> list[InAppNotification]:
    rows = await session.scalars(
        select(InAppNotification)
        .where(InAppNotification.user_id == user_id)
        .order_by(InAppNotification.created_at.desc(), InAppNotification.id.desc())
        .limit(limit)
    )
    return list(rows)


async def unread_count(session: AsyncSession, *, user_id: uuid.UUID) -> int:
    return (
        await session.scalar(
            select(func.count())
            .select_from(InAppNotification)
            .where(InAppNotification.user_id == user_id, InAppNotification.read_at.is_(None))
        )
    ) or 0


async def mark_read(session: AsyncSession, *, notification_id: uuid.UUID) -> InAppNotification:
    notification = await session.get(InAppNotification, notification_id)
    if notification is not None and notification.read_at is None:
        notification.read_at = datetime.now()
    return notification


async def mark_all_read(session: AsyncSession, *, user_id: uuid.UUID) -> int:
    result = await session.execute(
        select(InAppNotification).where(
            InAppNotification.user_id == user_id,
            InAppNotification.read_at.is_(None),
        )
    )
    count = 0
    now = datetime.now()
    for notification in result.scalars():
        notification.read_at = now
        count += 1
    return count


async def notify_all_tenant_users(
    session: AsyncSession, *, title: str, body: str, type: str = "info", payload: dict | None = None
) -> int:
    """Fan out an in-app notification to every active user in the current tenant."""
    user_ids = await session.scalars(
        select(User.id).where(User.is_active.is_(True), User.deleted_at.is_(None))
    )
    count = 0
    for uid in user_ids:
        await create_notification(
            session, user_id=uid, title=title, body=body, type=type, payload=payload
        )
        count += 1
    return count


async def on_payment_succeeded(
    session: AsyncSession,
    aggregate_type: str,
    aggregate_id: str,
    event_type: str,
    payload: dict,
) -> None:
    amount = payload.get("amount_minor", 0) / 100.0
    # Prefer the human-readable invoice number (INV-2026-000005) over the raw
    # UUID, which means nothing to gym staff reading the feed.
    reference = payload.get("invoice_id")
    if reference:
        try:
            invoice = await session.get(Invoice, uuid.UUID(str(reference)))
        except ValueError:
            invoice = None
        if invoice is not None:
            reference = invoice.number
    await notify_all_tenant_users(
        session,
        title="Payment received",
        body=f"Payment of ₹{amount:.2f} succeeded for invoice {reference}",
        type="billing",
        payload=payload,
    )


def register_handlers() -> None:
    from app.kernel.events import bus

    bus.register("billing.payment.succeeded", on_payment_succeeded)
