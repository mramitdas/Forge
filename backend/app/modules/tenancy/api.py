from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.db.session import get_platform_session
from app.deps import (
    Actor,
    get_session_for_actor,
    require_permission,
)
from app.modules.identity.models import Role, User, UserRole
from app.modules.identity.schemas import TokenResponse
from app.modules.members.models import Member
from app.modules.membership.models import Subscription
from app.modules.tenancy.models import Branch, Gym, SubscriptionTier
from app.modules.tenancy.schemas import (
    BranchCreate,
    BranchOut,
    BranchUpdate,
    GymOut,
    GymOwnerOut,
    GymSettingsOut,
    GymSettingsUpdate,
    GymSubscriptionOut,
    GymUpdateRequest,
    OwnerUpdateRequest,
    PlatformRevenueOut,
    PlatformSummaryOut,
    ProvisionGymRequest,
    SubscriptionEventOut,
    SubscriptionTierCreate,
    SubscriptionTierOut,
    SubscriptionTierUpdate,
    SubscriptionUpdateRequest,
)
from app.modules.tenancy.service import (
    change_gym_tier,
    create_tier,
    delete_branch,
    delete_gym,
    delete_tier,
    impersonate_owner,
    list_subscription_events,
    platform_revenue,
    provision_gym,
    update_branch,
    update_owner,
    update_tier,
)
from app.modules.tenancy.service import (
    update_gym as svc_update_gym,
)

platform_router = APIRouter(prefix="/platform", tags=["platform"])
tenant_router = APIRouter(prefix="/branches", tags=["branches"])
settings_router = APIRouter(prefix="/settings", tags=["settings"])


@platform_router.post("/gyms", response_model=GymOut, status_code=201)
async def create_gym(
    body: ProvisionGymRequest,
    actor: Annotated[Actor, Depends(require_permission("platform.gyms.create"))],
    session: Annotated[AsyncSession, Depends(get_platform_session)],
) -> GymOut:
    gym = await provision_gym(
        session,
        name=body.name,
        slug=body.slug,
        owner_email=str(body.owner_email),
        owner_name=body.owner_name,
        owner_password=body.owner_password,
        tier_code=body.tier_code,
        timezone=body.timezone,
        currency=body.currency,
        actor_user_id=actor.user_id,
        actor_email=actor.email,
    )
    return GymOut.model_validate(gym)


@platform_router.get("/gyms", response_model=list[GymOut])
async def list_gyms(
    actor: Annotated[Actor, Depends(require_permission("platform.gyms.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[GymOut]:
    rows = await session.scalars(
        select(Gym).where(Gym.deleted_at.is_(None)).order_by(Gym.name)
    )
    return [GymOut.model_validate(g) for g in rows]


@platform_router.patch("/gyms/{gym_id}", response_model=GymOut)
async def update_gym(
    gym_id: str,
    body: GymUpdateRequest,
    actor: Annotated[Actor, Depends(require_permission("platform.gyms.update"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> GymOut:
    gym = await svc_update_gym(
        session,
        gym_id=gym_id,
        name=body.name,
        timezone=body.timezone,
        currency=body.currency,
        status=body.status,
        tier_code=body.tier_code,
        cross_branch_access=body.cross_branch_access,
        actor_user_id=actor.user_id,
        actor_email=actor.email,
    )
    return GymOut.model_validate(gym)


@platform_router.delete("/gyms/{gym_id}", status_code=204)
async def remove_gym(
    gym_id: str,
    actor: Annotated[Actor, Depends(require_permission("platform.gyms.update"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await delete_gym(session, gym_id=gym_id, actor_id=actor.user_id)


async def _owner_out(session: AsyncSession, user: User) -> GymOwnerOut:
    gym = await session.get(Gym, user.tenant_id)
    return GymOwnerOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        gym_id=user.tenant_id,
        gym_name=gym.name if gym else "",
        gym_status=gym.status if gym else "unknown",
        gym_tier=gym.tier_code if gym else "",
        created_at=user.created_at,
    )


@platform_router.get("/owners", response_model=list[GymOwnerOut])
async def list_owners(
    actor: Annotated[Actor, Depends(require_permission("platform.owners.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[GymOwnerOut]:
    rows = await session.execute(
        select(User, Gym)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .join(Gym, Gym.id == User.tenant_id)
        .where(
            Role.name == "Gym Owner",
            Role.deleted_at.is_(None),
            User.deleted_at.is_(None),
            Gym.deleted_at.is_(None),
        )
        .order_by(Gym.name)
    )
    return [
        GymOwnerOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            gym_id=gym.id,
            gym_name=gym.name,
            gym_status=gym.status,
            gym_tier=gym.tier_code,
            created_at=u.created_at,
        )
        for u, gym in rows
    ]


@platform_router.patch("/owners/{owner_id}", response_model=GymOwnerOut)
async def update_gym_owner(
    owner_id: str,
    body: OwnerUpdateRequest,
    actor: Annotated[Actor, Depends(require_permission("platform.owners.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> GymOwnerOut:
    user = await update_owner(
        session,
        user_id=owner_id,
        full_name=body.full_name,
        email=str(body.email) if body.email else None,
        password=body.password,
        is_active=body.is_active,
    )
    return await _owner_out(session, user)


@platform_router.post("/owners/{owner_id}/impersonate", response_model=TokenResponse)
async def login_as_owner(
    owner_id: str,
    request: Request,
    actor: Annotated[Actor, Depends(require_permission("platform.owners.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> TokenResponse:
    return await impersonate_owner(
        session,
        user_id=owner_id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@platform_router.get("/tiers", response_model=list[SubscriptionTierOut])
async def list_tiers(
    actor: Annotated[Actor, Depends(require_permission("platform.subscriptions.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[SubscriptionTierOut]:
    rows = await session.scalars(
        select(SubscriptionTier).order_by(SubscriptionTier.code)
    )
    return [SubscriptionTierOut.model_validate(t) for t in rows]


@platform_router.get("/summary", response_model=PlatformSummaryOut)
async def platform_summary(
    actor: Annotated[Actor, Depends(require_permission("platform.sales.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> PlatformSummaryOut:
    gyms = (await session.scalars(select(Gym).where(Gym.deleted_at.is_(None)))).all()
    active_subs = await session.scalar(
        select(func.count())
        .select_from(Subscription)
        .where(Subscription.status == "active", Subscription.deleted_at.is_(None))
    )
    mrr = await session.scalar(
        select(func.coalesce(func.sum(Subscription.price_minor), 0)).where(
            Subscription.status == "active", Subscription.deleted_at.is_(None)
        )
    )
    owner_count = await session.scalar(
        select(func.count(func.distinct(User.id)))
        .select_from(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.name == "Gym Owner", User.deleted_at.is_(None))
    )
    statuses = {g.status: 0 for g in gyms}
    for g in gyms:
        statuses[g.status] = statuses.get(g.status, 0) + 1
    return PlatformSummaryOut(
        gyms_total=len(gyms),
        gyms_trial=statuses.get("trial", 0),
        gyms_active=statuses.get("active", 0),
        gyms_suspended=statuses.get("suspended", 0),
        owners_total=owner_count or 0,
        active_subscriptions=active_subs or 0,
        mrr_minor=mrr or 0,
    )


async def _gym_subscription_out(
    session: AsyncSession,
    gym: Gym,
    tiers: dict[str, SubscriptionTier],
) -> GymSubscriptionOut:
    tier = tiers.get(gym.tier_code)
    member_count = await session.scalar(
        select(func.count())
        .select_from(Member)
        .join(Branch, Branch.id == Member.branch_id)
        .where(Branch.gym_id == gym.id)
    )
    active_count = await session.scalar(
        select(func.count())
        .select_from(Subscription)
        .join(Branch, Branch.id == Subscription.branch_id)
        .where(Branch.gym_id == gym.id, Subscription.status == "active")
    )
    return GymSubscriptionOut(
        gym_id=gym.id,
        gym_name=gym.name,
        gym_status=gym.status,
        tier_code=gym.tier_code,
        tier_name=tier.name if tier else gym.tier_code,
        max_branches=tier.max_branches if tier else None,
        max_members=tier.max_members if tier else None,
        members_count=member_count or 0,
        active_subscriptions=active_count or 0,
    )


@platform_router.get("/subscriptions", response_model=list[GymSubscriptionOut])
async def list_subscriptions(
    actor: Annotated[Actor, Depends(require_permission("platform.subscriptions.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[GymSubscriptionOut]:
    gyms = (
        await session.scalars(
            select(Gym).where(Gym.deleted_at.is_(None)).order_by(Gym.name)
        )
    ).all()
    tiers = {
        t.code: t
        for t in (await session.scalars(select(SubscriptionTier))).all()
    }
    out: list[GymSubscriptionOut] = []
    for gym in gyms:
        out.append(await _gym_subscription_out(session, gym, tiers))
    return out


@platform_router.patch("/subscriptions/{gym_id}", response_model=GymSubscriptionOut)
async def update_subscription(
    gym_id: str,
    body: SubscriptionUpdateRequest,
    actor: Annotated[Actor, Depends(require_permission("platform.subscriptions.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> GymSubscriptionOut:
    gym = await change_gym_tier(
        session,
        gym_id=gym_id,
        tier_code=body.tier_code,
        actor_user_id=actor.user_id,
        actor_email=actor.email,
    )
    tiers = {
        t.code: t
        for t in (await session.scalars(select(SubscriptionTier))).all()
    }
    return await _gym_subscription_out(session, gym, tiers)


@platform_router.post("/tiers", response_model=SubscriptionTierOut, status_code=201)
async def create_subscription_tier(
    body: SubscriptionTierCreate,
    actor: Annotated[Actor, Depends(require_permission("platform.subscriptions.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> SubscriptionTierOut:
    tier = await create_tier(
        session,
        code=body.code,
        name=body.name,
        description=body.description,
        price_minor=body.price_minor,
        max_branches=body.max_branches,
        max_members=body.max_members,
        limits=body.limits,
    )
    return SubscriptionTierOut.model_validate(tier)


@platform_router.patch("/tiers/{tier_code}", response_model=SubscriptionTierOut)
async def update_subscription_tier(
    tier_code: str,
    body: SubscriptionTierUpdate,
    actor: Annotated[Actor, Depends(require_permission("platform.subscriptions.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> SubscriptionTierOut:
    tier = await update_tier(
        session,
        code=tier_code,
        name=body.name,
        description=body.description,
        price_minor=body.price_minor,
        max_branches=body.max_branches,
        max_members=body.max_members,
        limits=body.limits,
        is_active=body.is_active,
    )
    return SubscriptionTierOut.model_validate(tier)


@platform_router.delete("/tiers/{tier_code}", status_code=204)
async def remove_subscription_tier(
    tier_code: str,
    actor: Annotated[Actor, Depends(require_permission("platform.subscriptions.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await delete_tier(session, code=tier_code)


@platform_router.get("/subscription-events", response_model=list[SubscriptionEventOut])
async def subscription_activity(
    actor: Annotated[Actor, Depends(require_permission("platform.subscriptions.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[SubscriptionEventOut]:
    return await list_subscription_events(session)


@platform_router.get("/revenue", response_model=PlatformRevenueOut)
async def platform_revenue_endpoint(
    actor: Annotated[Actor, Depends(require_permission("platform.sales.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> PlatformRevenueOut:
    return await platform_revenue(session)


@tenant_router.get("", response_model=list[BranchOut])
async def list_branches(
    actor: Annotated[Actor, Depends(require_permission("tenancy.branches.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[BranchOut]:
    rows = await session.scalars(
        select(Branch)
        .where(Branch.gym_id == actor.tenant_id, Branch.deleted_at.is_(None))
        .order_by(Branch.name)
    )
    return [BranchOut.model_validate(b) for b in rows]


@tenant_router.post("", response_model=BranchOut, status_code=201)
async def create_branch(
    body: BranchCreate,
    actor: Annotated[Actor, Depends(require_permission("tenancy.branches.create"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> BranchOut:
    branch = Branch(
        gym_id=actor.tenant_id,
        name=body.name,
        code=body.code,
        address=body.address,
        phone=body.phone,
        country_code=body.country_code,
        gst_number=body.gst_number,
        timezone=body.timezone,
    )
    session.add(branch)
    await session.flush()
    return BranchOut.model_validate(branch)


@tenant_router.patch("/{branch_id}", response_model=BranchOut)
async def update_branch_endpoint(
    branch_id: uuid.UUID,
    body: BranchUpdate,
    actor: Annotated[Actor, Depends(require_permission("tenancy.branches.update"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> BranchOut:
    data = body.model_dump(exclude_unset=True)
    branch = await update_branch(
        session,
        gym_id=actor.tenant_id,
        branch_id=branch_id,
        data=data,
        actor_id=actor.user_id,
    )
    return BranchOut.model_validate(branch)


@tenant_router.delete("/{branch_id}", status_code=204)
async def remove_branch(
    branch_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("tenancy.branches.delete"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await delete_branch(
        session,
        gym_id=actor.tenant_id,
        branch_id=branch_id,
        actor_id=actor.user_id,
    )


@settings_router.get("", response_model=GymSettingsOut)
async def get_settings(
    actor: Annotated[Actor, Depends(require_permission("tenancy.settings.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> GymSettingsOut:
    gym = await session.get(Gym, actor.tenant_id)
    if gym is None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    return GymSettingsOut(
        name=gym.name,
        timezone=gym.timezone,
        currency=gym.currency,
        cross_branch_access=gym.cross_branch_access,
    )


@settings_router.patch("", response_model=GymSettingsOut)
async def update_settings(
    body: GymSettingsUpdate,
    actor: Annotated[Actor, Depends(require_permission("tenancy.settings.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> GymSettingsOut:
    gym = await session.get(Gym, actor.tenant_id)
    if gym is None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    gym.cross_branch_access = body.cross_branch_access
    await session.flush()
    return GymSettingsOut(
        name=gym.name,
        timezone=gym.timezone,
        currency=gym.currency,
        cross_branch_access=gym.cross_branch_access,
    )
