from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import Actor, get_session_for_actor, require_permission
from app.modules.membership import service as membership_svc
from app.modules.membership.schemas import (
    PlanCreate,
    PlanOut,
    SubscriptionCreate,
    SubscriptionOut,
)

router = APIRouter(prefix="/plans", tags=["membership"])


@router.post("", response_model=PlanOut, status_code=201)
async def create_plan(
    body: PlanCreate,
    actor: Annotated[Actor, Depends(require_permission("membership.plans.create"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> PlanOut:
    plan = await membership_svc.create_plan(
        session,
        tenant_id=actor.tenant_id,
        name=body.name,
        slug=body.slug,
        description=body.description,
        billing_period=body.billing_period,
        amount_minor=body.amount_minor,
        entry_fee_minor=body.entry_fee_minor,
        tax_rate_bp=body.tax_rate_bp,
        duration_months=body.duration_months,
        auto_renew=body.auto_renew,
    )
    return PlanOut.model_validate(plan)


@router.get("", response_model=list[PlanOut])
async def list_plans(
    actor: Annotated[Actor, Depends(require_permission("membership.plans.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[PlanOut]:
    plans = await membership_svc.list_plans(session, tenant_id=actor.tenant_id)
    return [PlanOut.model_validate(p) for p in plans]


@router.post("/subscribe", response_model=SubscriptionOut, status_code=201)
async def subscribe(
    body: SubscriptionCreate,
    actor: Annotated[Actor, Depends(require_permission("membership.subscriptions.activate"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> SubscriptionOut:
    sub = await membership_svc.create_subscription(
        session,
        tenant_id=actor.tenant_id,
        member_id=body.member_id,
        plan_id=body.plan_id,
        branch_id=body.branch_id,
        start_at=body.start_at,
    )
    return SubscriptionOut.model_validate(sub)


@router.get("/subscriptions", response_model=list[SubscriptionOut])
async def list_subscriptions(
    actor: Annotated[Actor, Depends(require_permission("membership.subscriptions.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    member_id: uuid.UUID | None = None,
) -> list[SubscriptionOut]:
    subs = await membership_svc.list_subscriptions(
        session, tenant_id=actor.tenant_id, member_id=member_id
    )
    return [SubscriptionOut.model_validate(s) for s in subs]


@router.post("/subscriptions/{subscription_id}/activate", response_model=SubscriptionOut)
async def activate(
    subscription_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("membership.subscriptions.activate"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> SubscriptionOut:
    sub = await membership_svc.activate_subscription(session, subscription_id)
    return SubscriptionOut.model_validate(sub)
