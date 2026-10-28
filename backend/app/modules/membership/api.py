from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import Actor, get_session_for_actor, require_permission
from app.kernel.pagination import OffsetPagination
from app.modules.membership import service as membership_svc
from app.modules.membership.schemas import (
    PlanCreate,
    PlanOut,
    PlanUpdate,
    RenewBody,
    SubscriptionCreate,
    SubscriptionOut,
    SubscriptionPageOut,
)

router = APIRouter(prefix="/plans", tags=["membership"])


@router.post("", response_model=PlanOut, status_code=201)
async def create_plan(
    body: PlanCreate,
    actor: Annotated[Actor, Depends(require_permission("membership.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> PlanOut:
    plan = await membership_svc.create_plan(
        session,
        tenant_id=actor.tenant_id,
        name=body.name,
        slug=body.slug,
        branch_id=body.branch_id,
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
    actor: Annotated[Actor, Depends(require_permission("membership.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    branch_id: uuid.UUID | None = None,
) -> list[PlanOut]:
    plans = await membership_svc.list_plans(
        session, tenant_id=actor.tenant_id, branch_id=branch_id
    )
    return [PlanOut.model_validate(p) for p in plans]


@router.patch("/{plan_id}", response_model=PlanOut)
async def update_plan(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    actor: Annotated[Actor, Depends(require_permission("membership.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> PlanOut:
    data = body.model_dump(exclude_unset=True)
    plan = await membership_svc.update_plan(
        session, tenant_id=actor.tenant_id, plan_id=plan_id, data=data
    )
    return PlanOut.model_validate(plan)


@router.delete("/{plan_id}", status_code=204)
async def remove_plan(
    plan_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("membership.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await membership_svc.delete_plan(
        session, tenant_id=actor.tenant_id, plan_id=plan_id
    )


@router.post("/subscribe", response_model=SubscriptionOut, status_code=201)
async def subscribe(
    body: SubscriptionCreate,
    actor: Annotated[Actor, Depends(require_permission("membership.manage"))],
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


@router.get("/subscriptions", response_model=SubscriptionPageOut)
async def list_subscriptions(
    actor: Annotated[Actor, Depends(require_permission("membership.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    member_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
) -> SubscriptionPageOut:
    pagination = OffsetPagination(page=page, page_size=page_size)
    subs, total = await membership_svc.list_subscriptions(
        session,
        tenant_id=actor.tenant_id,
        member_id=member_id,
        pagination=pagination,
    )
    return SubscriptionPageOut(
        items=[SubscriptionOut.model_validate(s) for s in subs],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post("/subscriptions/{subscription_id}/activate", response_model=SubscriptionOut)
async def activate(
    subscription_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("membership.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> SubscriptionOut:
    sub = await membership_svc.activate_subscription(session, subscription_id)
    return SubscriptionOut.model_validate(sub)


@router.post("/subscriptions/{subscription_id}/renew", response_model=SubscriptionOut)
async def renew(
    subscription_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("membership.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    body: RenewBody | None = None,
) -> SubscriptionOut:
    sub = await membership_svc.renew_subscription(
        session, subscription_id, start_at=body.start_at if body else None
    )
    return SubscriptionOut.model_validate(sub)


class UpgradeBody(BaseModel):
    plan_id: uuid.UUID


@router.post("/subscriptions/{subscription_id}/upgrade", response_model=SubscriptionOut)
async def upgrade(
    subscription_id: uuid.UUID,
    body: UpgradeBody,
    actor: Annotated[Actor, Depends(require_permission("membership.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> SubscriptionOut:
    sub = await membership_svc.upgrade_subscription(
        session, subscription_id, body.plan_id
    )
    return SubscriptionOut.model_validate(sub)
