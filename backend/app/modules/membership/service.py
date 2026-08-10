from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.kernel.events import bus
from app.modules.members.models import Member
from app.modules.membership.models import (
    MembershipPlan,
    Subscription,
)

BILLING_PERIOD_MONTHS = {"monthly": 1, "quarterly": 3, "annual": 12}


async def create_plan(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    name: str,
    slug: str,
    description: str | None,
    billing_period: str,
    amount_minor: int,
    entry_fee_minor: int,
    tax_rate_bp: int,
    duration_months: int | None,
    auto_renew: bool,
) -> MembershipPlan:
    if billing_period not in BILLING_PERIOD_MONTHS:
        raise ValidationError("Invalid billing period", code="INVALID_BILLING_PERIOD")
    dup = await session.execute(
        select(MembershipPlan.id).where(
            MembershipPlan.tenant_id == tenant_id,
            MembershipPlan.slug == slug,
            MembershipPlan.deleted_at.is_(None),
        )
    )
    if dup.first() is not None:
        raise ConflictError("Plan slug already exists", code="SLUG_TAKEN")
    plan = MembershipPlan(
        tenant_id=tenant_id,
        name=name,
        slug=slug,
        description=description,
        billing_period=billing_period,
        amount_minor=amount_minor,
        entry_fee_minor=entry_fee_minor,
        tax_rate_bp=tax_rate_bp,
        duration_months=duration_months,
        auto_renew=auto_renew,
        is_active=True,
    )
    session.add(plan)
    await session.flush()
    return plan


async def list_plans(session: AsyncSession, *, tenant_id: uuid.UUID) -> list[MembershipPlan]:
    rows = await session.scalars(
        select(MembershipPlan)
        .where(
            MembershipPlan.tenant_id == tenant_id,
            MembershipPlan.deleted_at.is_(None),
            MembershipPlan.is_active.is_(True),
        )
        .order_by(MembershipPlan.amount_minor)
    )
    return list(rows)


async def get_plan(session: AsyncSession, plan_id: uuid.UUID) -> MembershipPlan:
    plan = await session.get(MembershipPlan, plan_id)
    if plan is None or plan.deleted_at is not None:
        raise NotFoundError("Plan not found", code="NOT_FOUND")
    return plan


async def create_subscription(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    member_id: uuid.UUID,
    plan_id: uuid.UUID,
    branch_id: uuid.UUID,
    start_at: datetime | None = None,
) -> Subscription:
    member = await session.get(Member, member_id)
    if member is None or member.deleted_at is not None:
        raise NotFoundError("Member not found", code="NOT_FOUND")
    if member.tenant_id != tenant_id:
        raise NotFoundError("Member not found", code="NOT_FOUND")
    plan = await get_plan(session, plan_id)
    if plan.tenant_id != tenant_id:
        raise NotFoundError("Plan not found", code="NOT_FOUND")

    start = start_at or datetime.now(UTC)
    duration_months = plan.duration_months or BILLING_PERIOD_MONTHS.get(plan.billing_period, 1)
    end = start + timedelta(days=30 * duration_months)

    sub = Subscription(
        tenant_id=tenant_id,
        member_id=member_id,
        plan_id=plan_id,
        branch_id=branch_id,
        status="pending",
        start_at=start,
        end_at=end,
        auto_renew=plan.auto_renew,
        price_minor=plan.amount_minor,
        currency="INR",
    )
    session.add(sub)
    await session.flush()

    # Invoicing lives in the billing module; this is a synchronous cross-module call.
    from app.modules.billing.service import create_invoice_for_subscription

    await create_invoice_for_subscription(session, sub, entry_fee_minor=plan.entry_fee_minor)

    await bus.emit(
        session,
        tenant_id=tenant_id,
        aggregate_type="subscription",
        aggregate_id=sub.id,
        event_type="membership.subscription.created",
        payload={"subscription_id": str(sub.id), "member_id": str(member_id)},
    )
    return sub


async def activate_subscription(session: AsyncSession, subscription_id: uuid.UUID) -> Subscription:
    sub = await session.get(Subscription, subscription_id)
    if sub is None or sub.deleted_at is not None:
        raise NotFoundError("Subscription not found", code="NOT_FOUND")
    if sub.status != "pending":
        raise ConflictError("Subscription not pending", code="INVALID_STATE")
    sub.status = "active"
    await session.flush()
    member = await session.get(Member, sub.member_id)
    if member is not None and member.status != "active":
        member.status = "active"
        member.joined_at = datetime.now(UTC)
    await bus.emit(
        session,
        tenant_id=sub.tenant_id,
        aggregate_type="subscription",
        aggregate_id=sub.id,
        event_type="membership.subscription.activated",
        payload={"subscription_id": str(sub.id), "member_id": str(sub.member_id)},
    )
    return sub


async def get_active_subscription(
    session: AsyncSession, member_id: uuid.UUID
) -> Subscription | None:
    now = datetime.now(UTC)
    row = await session.execute(
        select(Subscription)
        .where(
            Subscription.member_id == member_id,
            Subscription.status == "active",
            Subscription.start_at <= now,
            Subscription.end_at >= now,
            Subscription.deleted_at.is_(None),
        )
        .limit(1)
    )
    return row.scalar_one_or_none()


async def list_subscriptions(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    member_id: uuid.UUID | None = None,
) -> list[Subscription]:
    stmt = select(Subscription).where(
        Subscription.tenant_id == tenant_id,
        Subscription.deleted_at.is_(None),
    )
    if member_id:
        stmt = stmt.where(Subscription.member_id == member_id)
    rows = (
        await session.execute(stmt.order_by(Subscription.start_at.desc()))
    ).scalars().all()
    return list(rows)
