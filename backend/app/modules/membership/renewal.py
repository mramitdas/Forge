"""Subscription renewal/expiry worker.

Polls for active subscriptions whose end date has passed and:
  * renews them when the plan allows auto-renewal (extends the term, issues a
    new invoice, re-enables the member), or
  * expires them when they do not auto-renew or the plan is disabled/deleted
    (marks the subscription expired and disables the member).

Runs in the same tenant-aware style as the outbox Dispatcher.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.kernel.events import bus
from app.modules.billing.service import create_invoice_for_subscription
from app.modules.members.models import Member
from app.modules.membership.models import Subscription
from app.modules.membership.service import BILLING_PERIOD_MONTHS, MembershipPlan

logger = get_logger(__name__)


async def _handle_due_subscription(session: AsyncSession, sub: Subscription) -> str:
    plan = await session.get(MembershipPlan, sub.plan_id)
    renew = sub.auto_renew and plan is not None and plan.is_active and plan.deleted_at is None

    if renew and plan is not None:
        duration_months = plan.duration_months or BILLING_PERIOD_MONTHS.get(
            plan.billing_period, 1
        )
        start = sub.end_at or datetime.now(UTC)
        sub.start_at = start
        sub.end_at = start + timedelta(days=30 * duration_months)
        sub.version += 1
        await create_invoice_for_subscription(
            session, sub, tax_rate_bp=plan.tax_rate_bp
        )
        member = await session.get(Member, sub.member_id)
        if member is not None and member.deleted_at is None and not member.is_active:
            member.is_active = True
            member.version += 1
        await bus.emit(
            session,
            tenant_id=sub.tenant_id,
            aggregate_type="subscription",
            aggregate_id=sub.id,
            event_type="membership.subscription.renewed",
            payload={"subscription_id": str(sub.id), "member_id": str(sub.member_id)},
        )
        return "renewed"
    else:
        sub.status = "expired"
        sub.version += 1
        member = await session.get(Member, sub.member_id)
        if member is not None and member.deleted_at is None and member.is_active:
            member.is_active = False
            member.version += 1
        await bus.emit(
            session,
            tenant_id=sub.tenant_id,
            aggregate_type="subscription",
            aggregate_id=sub.id,
            event_type="membership.subscription.expired",
            payload={"subscription_id": str(sub.id), "member_id": str(sub.member_id)},
        )
        return "expired"


class RenewalWorker:
    """Polls for due subscriptions and renews or expires them per tenant."""

    def __init__(self, batch_size: int = 100) -> None:
        self.batch_size = batch_size

    async def run_once(self) -> int:
        now = datetime.now(UTC)
        maker = get_sessionmaker()
        async with maker() as session:
            await session.begin()
            rows = (
                await session.execute(
                    select(Subscription)
                    .where(
                        Subscription.status == "active",
                        Subscription.end_at.is_not(None),
                        Subscription.end_at <= now,
                        Subscription.deleted_at.is_(None),
                    )
                    .order_by(Subscription.end_at.asc())
                    .limit(self.batch_size)
                )
            ).scalars().all()
            pending = [(row.id, row.tenant_id) for row in rows]
            await session.commit()

        processed = 0
        for sub_id, tenant_id in pending:
            token = set_tenant_context(
                TenantContext(tenant_id=tenant_id, platform_scope=False)
            )
            try:
                async with maker() as session:
                    await session.begin()
                    sub = await session.get(Subscription, sub_id)
                    if sub is not None and sub.status == "active":
                        await _handle_due_subscription(session, sub)
                        processed += 1
                    await session.commit()
            except Exception:
                logger.exception("renewal failed", subscription_id=str(sub_id))
            finally:
                reset_tenant_context(token)
        return processed

    async def run_forever(self, interval_seconds: float = 30.0) -> None:
        while True:
            try:
                await self.run_once()
            except Exception:
                logger.exception("renewal worker loop error")
            import asyncio

            await asyncio.sleep(interval_seconds)


def start_renewal_worker() -> RenewalWorker | None:
    settings = get_settings()
    if settings.debug:
        return None
    worker = RenewalWorker()
    return worker
