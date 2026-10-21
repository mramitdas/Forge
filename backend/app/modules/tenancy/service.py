from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.security import hash_password
from app.kernel.events import bus
from app.modules.identity import service as identity_svc
from app.modules.identity.models import Credential, Role, User, UserRole, split_full_name
from app.modules.identity.permissions import ROLE_TEMPLATES, template_permission_codes
from app.modules.identity.schemas import TokenResponse
from app.modules.identity.service import create_role
from app.modules.members.models import MEMBER_STATUSES, Member
from app.modules.membership.models import MembershipPlan, Subscription
from app.modules.tenancy.models import (
    Branch,
    Gym,
    GymSubscriptionEvent,
    SubscriptionTier,
    TenantEntitlement,
)
from app.modules.tenancy.schemas import (
    PlatformRevenueOut,
    RevenuePointOut,
    SoldSubscriptionOut,
    SubscriptionEventOut,
)


async def provision_gym(
    session: AsyncSession,
    *,
    name: str,
    slug: str,
    owner_email: str,
    owner_name: str,
    owner_password: str,
    tier_code: str = "starter",
    timezone: str = "Asia/Kolkata",
    currency: str = "INR",
    actor_user_id: uuid.UUID | None = None,
    actor_email: str | None = None,
) -> Gym:
    existing = await session.execute(select(Gym.id).where(Gym.slug == slug))
    if existing.first() is not None:
        raise ConflictError("Gym slug already exists", code="SLUG_TAKEN")

    tier = await session.get(SubscriptionTier, tier_code)
    if tier is None:
        raise ConflictError("Unknown tier", code="UNKNOWN_TIER")
    if not tier.is_active:
        raise ConflictError("Tier is disabled", code="TIER_DISABLED")

    gym = Gym(
        name=name,
        slug=slug,
        status="trial",
        tier_code=tier_code,
        timezone=timezone,
        currency=currency,
    )
    session.add(gym)
    await session.flush()
    gym.tenant_id = gym.id  # self-tenant: gym's tenant_id == gym.id
    await session.flush()

    session.add(
        TenantEntitlement(
            gym_id=gym.id,
            tenant_id=gym.id,
            tier_code=tier_code,
        )
    )

    owner_first, owner_last = split_full_name(owner_name)
    owner = User(
        tenant_id=gym.id,
        email=owner_email.lower(),
        full_name=owner_name,
        first_name=owner_first,
        last_name=owner_last,
        is_active=True,
        is_platform=False,
    )
    owner.credential = Credential(password_hash=hash_password(owner_password))
    session.add(owner)
    await session.flush()

    owner_role = await _seed_roles(session, gym.id)
    session.add(UserRole(user_id=owner.id, role_id=owner_role.id))

    session.add(
        GymSubscriptionEvent(
            gym_id=gym.id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            event_type="provisioned",
            from_tier_code=None,
            to_tier_code=tier_code,
        )
    )

    await bus.emit(
        session,
        tenant_id=gym.id,
        aggregate_type="gym",
        aggregate_id=gym.id,
        event_type="tenancy.gym.provisioned",
        payload={"gym_id": str(gym.id), "slug": slug, "tier": tier_code},
    )
    return gym


async def _seed_roles(session: AsyncSession, tenant_id: uuid.UUID) -> Role:
    owner_role: Role | None = None
    for key, template in ROLE_TEMPLATES.items():
        if template.get("scope", "gym") != "gym":
            continue
        role = await create_role(
            session,
            tenant_id=tenant_id,
            name=template["name"],
            description=template.get("description"),
            permission_codes=template_permission_codes(template),
            branch_scope="all",
            is_system=template.get("is_system", True),
            is_editable=template.get("is_editable", True),
        )
        if key == "gym_owner":
            owner_role = role
    if owner_role is None:
        raise RuntimeError("owner role template missing")
    return owner_role


async def update_gym(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
    name: str | None = None,
    timezone: str | None = None,
    currency: str | None = None,
    status: str | None = None,
    tier_code: str | None = None,
    cross_branch_access: bool | None = None,
    actor_user_id: uuid.UUID | None = None,
    actor_email: str | None = None,
) -> Gym:
    gym = await session.get(Gym, gym_id)
    if gym is None or gym.deleted_at is not None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    if name is not None:
        gym.name = name
    if timezone is not None:
        gym.timezone = timezone
    if currency is not None:
        gym.currency = currency
    if status is not None:
        if status not in {"active", "suspended", "trial"}:
            raise ValidationError("Invalid gym status", code="INVALID_STATUS")
        gym.status = status
    if tier_code is not None and tier_code != gym.tier_code:
        tier = await session.get(SubscriptionTier, tier_code)
        if tier is None:
            raise ConflictError("Unknown tier", code="UNKNOWN_TIER")
        if not tier.is_active:
            raise ConflictError("Tier is disabled", code="TIER_DISABLED")
        previous = gym.tier_code
        gym.tier_code = tier_code
        await _apply_tier(session, gym)
        await _record_tier_change(
            session,
            gym=gym,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            from_tier_code=previous,
        )
    if cross_branch_access is not None:
        gym.cross_branch_access = cross_branch_access
    await session.flush()
    return gym


async def delete_gym(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Soft-delete a gym and every account in its tenant so logins fail."""
    gym = await session.get(Gym, gym_id)
    if gym is None or gym.deleted_at is not None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    now = datetime.now(UTC)
    gym.deleted_at = now
    gym.deleted_by = actor_id
    users = await session.scalars(
        select(User).where(User.tenant_id == gym_id, User.deleted_at.is_(None))
    )
    for user in users:
        user.deleted_at = now
        user.deleted_by = actor_id
    branches = await session.scalars(
        select(Branch).where(Branch.gym_id == gym_id, Branch.deleted_at.is_(None))
    )
    for branch in branches:
        branch.deleted_at = now
        branch.deleted_by = actor_id
    members = await session.scalars(
        select(Member)
        .join(Branch, Member.branch_id == Branch.id)
        .where(Branch.gym_id == gym_id, Member.deleted_at.is_(None))
    )
    for member in members:
        member.deleted_at = now
        member.deleted_by = actor_id
    await session.flush()
    await bus.emit(
        session,
        tenant_id=gym_id,
        aggregate_type="gym",
        aggregate_id=gym_id,
        event_type="tenancy.gym.removed",
        payload={"gym_id": str(gym_id)},
    )


async def restore_gym(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
    tier_code: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    actor_email: str | None = None,
) -> Gym:
    """Un-soft-delete a gym and everything `delete_gym` cascaded.

    Restores only rows whose `deleted_at` matches the gym's `deleted_at`
    exactly — i.e. the set tombstoned by that single delete. Rows a user
    deleted later (different timestamp) are left deleted.

    `tier_code` optionally re-attaches an active subscription for gyms
    whose tier was deleted/disabled while they were tombstoned; all tier
    validation runs before any un-tombstoning so a rejected request never
    leaves a half-restored gym.
    """
    gym = await session.get(Gym, gym_id)
    if gym is None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    if gym.deleted_at is None:
        raise ConflictError("Gym is not deleted", code="GYM_NOT_DELETED")

    stamp = gym.deleted_at

    if tier_code is not None:
        tier = await session.get(SubscriptionTier, tier_code)
        if tier is None:
            raise ConflictError("Unknown tier", code="UNKNOWN_TIER")
        if not tier.is_active:
            raise ConflictError("Tier is disabled", code="TIER_DISABLED")
    else:
        tier = await session.get(SubscriptionTier, gym.tier_code)
        if tier is None:
            raise ConflictError("Gym's tier no longer exists", code="TIER_MISSING")
        if not tier.is_active:
            raise ConflictError("Gym's tier is disabled", code="TIER_DISABLED")

    users = await session.scalars(
        select(User).where(User.tenant_id == gym_id, User.deleted_at == stamp)
    )
    for user in users:
        user.deleted_at = None
        user.deleted_by = None

    branches = await session.scalars(
        select(Branch).where(Branch.gym_id == gym_id, Branch.deleted_at == stamp)
    )
    branch_ids = []
    for branch in branches:
        branch.deleted_at = None
        branch.deleted_by = None
        branch_ids.append(branch.id)

    if branch_ids:
        members = await session.scalars(
            select(Member).where(
                Member.branch_id.in_(branch_ids), Member.deleted_at == stamp
            )
        )
        for member in members:
            member.deleted_at = None
            member.deleted_by = None

    gym.deleted_at = None
    gym.deleted_by = None
    if tier_code is not None and tier_code != gym.tier_code:
        previous = gym.tier_code
        gym.tier_code = tier_code
        await _apply_tier(session, gym)
        await _record_tier_change(
            session,
            gym=gym,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            from_tier_code=previous,
        )
    await session.flush()
    await bus.emit(
        session,
        tenant_id=gym_id,
        aggregate_type="gym",
        aggregate_id=gym_id,
        event_type="tenancy.gym.restored",
        payload={"gym_id": str(gym_id)},
    )
    return gym


async def _get_branch(
    session: AsyncSession, *, gym_id: uuid.UUID, branch_id: uuid.UUID
) -> Branch:
    branch = await session.get(Branch, branch_id)
    if branch is None or branch.deleted_at is not None or branch.gym_id != gym_id:
        raise NotFoundError("Branch not found", code="NOT_FOUND")
    return branch


_BRANCH_DETAIL_FIELDS = (
    "name",
    "code",
    "address",
    "phone",
    "country_code",
    "gst_number",
    "timezone",
)


def _full_phone_digits(country_code: str | None, phone: str | None) -> str:
    """Canonical per-gym phone identity.

    Uses the phone field alone when it already carries the country dial
    code (e.g. "+91 98765 43210", or "919876543210" with cc "+91");
    otherwise prefixes the dial digits to the local number.
    """
    cc = "".join(ch for ch in (country_code or "") if ch.isdigit())
    ph = "".join(ch for ch in (phone or "") if ch.isdigit())
    if not ph:
        return ""
    if cc and ph.startswith(cc):
        return ph
    return f"{cc}{ph}"


async def ensure_branch_fields_free(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
    code: str | None = None,
    phone: str | None = None,
    country_code: str | None = None,
    gst_number: str | None = None,
    exclude_branch_id: uuid.UUID | None = None,
) -> None:
    """Raise 409 if another live branch in this gym already uses code/phone/GST."""
    new_code = (code or "").strip().lower() or None
    new_gst = (gst_number or "").strip().upper() or None
    new_phone = _full_phone_digits(country_code, phone) or None
    if new_code is None and new_gst is None and new_phone is None:
        return
    others = await session.scalars(
        select(Branch).where(Branch.gym_id == gym_id, Branch.deleted_at.is_(None))
    )
    for other in others:
        if exclude_branch_id is not None and other.id == exclude_branch_id:
            continue
        if new_code and other.code and other.code.strip().lower() == new_code:
            raise ConflictError("Branch code already in use", code="CODE_TAKEN")
        if (
            new_phone
            and other.phone
            and _full_phone_digits(other.country_code, other.phone) == new_phone
        ):
            raise ConflictError("Phone number already in use", code="PHONE_TAKEN")
        if (
            new_gst
            and other.gst_number
            and other.gst_number.strip().upper() == new_gst
        ):
            raise ConflictError("GST number already in use", code="GST_TAKEN")


async def update_branch(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
    branch_id: uuid.UUID,
    data: dict,
    actor_id: uuid.UUID | None = None,
) -> Branch:
    branch = await _get_branch(session, gym_id=gym_id, branch_id=branch_id)
    if not branch.is_active and any(f in data for f in _BRANCH_DETAIL_FIELDS):
        raise ConflictError(
            "Enable the branch before editing its details", code="BRANCH_DISABLED"
        )
    if any(f in data for f in ("code", "phone", "country_code", "gst_number")):
        await ensure_branch_fields_free(
            session,
            gym_id=gym_id,
            code=data.get("code", branch.code),
            phone=data.get("phone", branch.phone),
            country_code=data.get("country_code", branch.country_code),
            gst_number=data.get("gst_number", branch.gst_number),
            exclude_branch_id=branch_id,
        )
    for field in _BRANCH_DETAIL_FIELDS:
        if field in data:
            setattr(branch, field, data[field])
    if data.get("is_active") is not None and data["is_active"] != branch.is_active:
        branch.is_active = data["is_active"]
        if branch.is_active:
            await _enable_branch_members(session, branch_id, actor_id)
        else:
            await _disable_branch_members(session, branch_id, actor_id)
    await session.flush()
    return branch


async def delete_branch(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
    branch_id: uuid.UUID,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Soft-delete a branch and every member assigned to it."""
    branch = await _get_branch(session, gym_id=gym_id, branch_id=branch_id)
    now = datetime.now(UTC)
    branch.deleted_at = now
    branch.deleted_by = actor_id
    branch.is_active = False
    members = await session.scalars(
        select(Member).where(
            Member.branch_id == branch_id, Member.deleted_at.is_(None)
        )
    )
    for member in members:
        member.deleted_at = now
        member.deleted_by = actor_id
    await session.flush()
    await bus.emit(
        session,
        tenant_id=gym_id,
        aggregate_type="branch",
        aggregate_id=branch_id,
        event_type="tenancy.branch.removed",
        payload={"branch_id": str(branch_id)},
    )


async def _disable_branch_members(
    session: AsyncSession, branch_id: uuid.UUID, actor_id: uuid.UUID | None
) -> None:
    """Freeze every live member of a branch when the branch is disabled.

    The member's previous status is recorded in custom_data so re-enabling
    the branch can restore exactly who was frozen by this action.
    """
    now = datetime.now(UTC)
    members = await session.scalars(
        select(Member).where(
            Member.branch_id == branch_id, Member.deleted_at.is_(None)
        )
    )
    for member in members:
        if member.status not in {"frozen", "lapsed", "cancelled"}:
            custom = dict(member.custom_data or {})
            custom["branch_frozen_prev"] = member.status
            member.custom_data = custom
            member.status = "frozen"
            member.version += 1
            member.updated_by = actor_id
            member.updated_at = now


async def _enable_branch_members(
    session: AsyncSession, branch_id: uuid.UUID, actor_id: uuid.UUID | None
) -> None:
    """Restore members frozen by a branch disable once the branch is enabled."""
    now = datetime.now(UTC)
    members = await session.scalars(
        select(Member).where(
            Member.branch_id == branch_id, Member.deleted_at.is_(None)
        )
    )
    for member in members:
        previous = (member.custom_data or {}).get("branch_frozen_prev")
        if previous is None or previous not in MEMBER_STATUSES:
            continue
        custom = dict(member.custom_data)
        custom.pop("branch_frozen_prev", None)
        member.custom_data = custom
        member.status = previous
        member.version += 1
        member.updated_by = actor_id
        member.updated_at = now


async def change_gym_tier(
    session: AsyncSession,
    *,
    gym_id: uuid.UUID,
    tier_code: str,
    actor_user_id: uuid.UUID | None = None,
    actor_email: str | None = None,
) -> Gym:
    gym = await session.get(Gym, gym_id)
    if gym is None or gym.deleted_at is not None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    tier = await session.get(SubscriptionTier, tier_code)
    if tier is None:
        raise ConflictError("Unknown tier", code="UNKNOWN_TIER")
    if not tier.is_active:
        raise ConflictError("Tier is disabled", code="TIER_DISABLED")
    if gym.tier_code != tier_code:
        previous = gym.tier_code
        gym.tier_code = tier_code
        await _apply_tier(session, gym)
        await _record_tier_change(
            session,
            gym=gym,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            from_tier_code=previous,
        )
    await session.flush()
    return gym


async def _record_tier_change(
    session: AsyncSession,
    *,
    gym: Gym,
    actor_user_id: uuid.UUID | None,
    actor_email: str | None,
    from_tier_code: str,
) -> None:
    session.add(
        GymSubscriptionEvent(
            gym_id=gym.id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            event_type="tier_changed",
            from_tier_code=from_tier_code,
            to_tier_code=gym.tier_code,
        )
    )


async def _apply_tier(session: AsyncSession, gym: Gym) -> None:
    """Close the current entitlement and open a new one for the gym's tier."""
    now = datetime.now(UTC)
    current = await session.scalars(
        select(TenantEntitlement).where(
            TenantEntitlement.gym_id == gym.id, TenantEntitlement.valid_to.is_(None)
        )
    )
    for entitlement in current:
        entitlement.valid_to = now
    session.add(
        TenantEntitlement(
            gym_id=gym.id,
            tenant_id=gym.id,
            tier_code=gym.tier_code,
            valid_from=now,
        )
    )
    await session.flush()
    await bus.emit(
        session,
        tenant_id=gym.id,
        aggregate_type="gym",
        aggregate_id=gym.id,
        event_type="tenancy.gym.subscription.changed",
        payload={"gym_id": str(gym.id), "tier": gym.tier_code},
    )


async def update_owner(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    full_name: str | None = None,
    email: str | None = None,
    password: str | None = None,
    is_active: bool | None = None,
) -> User:
    result = await session.execute(
        select(User)
        .where(User.id == user_id, User.deleted_at.is_(None))
        .options(selectinload(User.credential))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("Owner not found", code="NOT_FOUND")
    is_owner = await session.scalar(
        select(func.count())
        .select_from(UserRole)
        .join(Role, Role.id == UserRole.role_id)
        .where(
            UserRole.user_id == user.id,
            Role.name == "Gym Owner",
            Role.deleted_at.is_(None),
        )
    )
    if not is_owner:
        raise NotFoundError("Owner not found", code="NOT_FOUND")
    if email is not None and email.lower() != user.email:
        existing = await session.execute(
            select(User.id).where(
                User.tenant_id == user.tenant_id,
                User.email == email.lower(),
                User.deleted_at.is_(None),
                User.id != user.id,
            )
        )
        if existing.first() is not None:
            raise ConflictError("Email already in use", code="EMAIL_TAKEN")
        user.email = email.lower()
    if full_name is not None:
        user.full_name = full_name
        user.first_name, user.last_name = split_full_name(user.full_name)
    if is_active is not None:
        user.is_active = is_active
    if password is not None:
        user.credential.password_hash = hash_password(password)
        user.credential.must_change = False
    await session.flush()
    return user


async def impersonate_owner(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    ip: str | None = None,
    user_agent: str | None = None,
) -> TokenResponse:
    """Issue a session for a gym owner so platform staff can debug their app."""
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFoundError("Owner not found", code="NOT_FOUND")
    if not user.is_active:
        raise ConflictError("Owner account is disabled", code="ACCOUNT_DISABLED")
    gym = await session.get(Gym, user.tenant_id)
    if gym is None or gym.deleted_at is not None:
        raise NotFoundError("Gym not found", code="NOT_FOUND")
    if gym.status not in {"active", "trial"}:
        raise ConflictError("Gym is not active", code="GYM_SUSPENDED")
    return await identity_svc.issue_tokens(session, user, ip=ip, user_agent=user_agent)


async def create_tier(
    session: AsyncSession,
    *,
    code: str,
    name: str,
    description: str | None,
    price_minor: int | None,
    max_branches: int | None,
    max_members: int | None,
    limits: dict,
) -> SubscriptionTier:
    existing = await session.get(SubscriptionTier, code)
    if existing is not None:
        raise ConflictError("Tier already exists", code="TIER_EXISTS")
    tier = SubscriptionTier(
        code=code,
        name=name,
        description=description,
        price_minor=price_minor,
        max_branches=max_branches,
        max_members=max_members,
        limits=limits or {},
        is_active=True,
    )
    session.add(tier)
    await session.flush()
    return tier


async def update_tier(
    session: AsyncSession,
    *,
    code: str,
    name: str | None = None,
    description: str | None = None,
    price_minor: int | None = None,
    max_branches: int | None = None,
    max_members: int | None = None,
    limits: dict | None = None,
    is_active: bool | None = None,
) -> SubscriptionTier:
    tier = await session.get(SubscriptionTier, code)
    if tier is None:
        raise NotFoundError("Tier not found", code="NOT_FOUND")
    if is_active is False and tier.is_active:
        in_use = await session.scalar(
            select(func.count())
            .select_from(Gym)
            .where(Gym.tier_code == code, Gym.deleted_at.is_(None))
        )
        if in_use:
            raise ConflictError(
                "Tier is still referenced by gyms; re-point those gyms before disabling",
                code="TIER_IN_USE",
            )
    if name is not None:
        tier.name = name
    if description is not None:
        tier.description = description
    if price_minor is not None:
        tier.price_minor = price_minor
    if max_branches is not None:
        tier.max_branches = max_branches
    if max_members is not None:
        tier.max_members = max_members
    if limits is not None:
        tier.limits = limits
    if is_active is not None:
        tier.is_active = is_active
    await session.flush()
    return tier


async def delete_tier(session: AsyncSession, *, code: str) -> None:
    tier = await session.get(SubscriptionTier, code)
    if tier is None:
        raise NotFoundError("Tier not found", code="NOT_FOUND")
    in_use = await session.scalar(
        select(func.count())
        .select_from(Gym)
        .where(Gym.tier_code == code, Gym.deleted_at.is_(None))
    )
    if in_use:
        raise ConflictError(
            "Tier is still referenced by gyms; re-point those gyms before deleting",
            code="TIER_IN_USE",
        )
    await session.delete(tier)
    await session.flush()


async def list_subscription_events(
    session: AsyncSession, *, limit: int = 50
) -> list[SubscriptionEventOut]:
    rows = await session.execute(
        select(GymSubscriptionEvent, Gym.name)
        .join(Gym, Gym.id == GymSubscriptionEvent.gym_id)
        .order_by(GymSubscriptionEvent.created_at.desc(), GymSubscriptionEvent.id.desc())
        .limit(limit)
    )
    return [
        SubscriptionEventOut(
            id=event.id,
            gym_id=event.gym_id,
            gym_name=gym_name,
            actor_email=event.actor_email,
            event_type=event.event_type,
            from_tier_code=event.from_tier_code,
            to_tier_code=event.to_tier_code,
            created_at=event.created_at,
        )
        for event, gym_name in rows
    ]


async def platform_revenue(
    session: AsyncSession, *, months: int = 12, sold_limit: int = 200
) -> PlatformRevenueOut:
    month_expr = text("date_trunc('month', subscriptions.start_at)")
    rows = await session.execute(
        select(
            month_expr,
            func.coalesce(func.sum(Subscription.price_minor), 0),
            func.count(),
        )
        .where(Subscription.deleted_at.is_(None))
        .group_by(month_expr)
        .order_by(month_expr)
    )
    by_month: dict[str, tuple[int, int]] = {}
    for month, revenue, count in rows.all():
        by_month[str(month)[:7]] = (revenue or 0, count or 0)

    now = datetime.now(UTC)
    series: list[RevenuePointOut] = []
    # Zero-based month index; stepping by calendar months keeps the axis
    # consecutive regardless of month lengths (31-day math skips Februarys).
    start_index = now.year * 12 + (now.month - 1) - (months - 1)
    for i in range(months):
        year, month_index = divmod(start_index + i, 12)
        key = f"{year:04d}-{month_index + 1:02d}"
        revenue, count = by_month.get(key, (0, 0))
        series.append(
            RevenuePointOut(month=key, revenue_minor=revenue, subscriptions_sold=count)
        )

    sold_rows = await session.execute(
        select(
            Subscription.id,
            MembershipPlan.name,
            Member.first_name,
            Member.last_name,
            Gym.name,
            Branch.name,
            Subscription.status,
            Subscription.price_minor,
            Subscription.currency,
            Subscription.start_at,
        )
        .join(MembershipPlan, MembershipPlan.id == Subscription.plan_id)
        .join(Member, Member.id == Subscription.member_id)
        .join(Branch, Branch.id == Subscription.branch_id)
        .join(Gym, Gym.id == Branch.gym_id)
        .where(Subscription.deleted_at.is_(None))
        .order_by(Subscription.start_at.desc(), Subscription.id.desc())
        .limit(sold_limit)
    )
    sold = [
        SoldSubscriptionOut(
            id=row[0],
            plan_name=row[1],
            member_name=" ".join(
                p for p in (row[2] or "", row[3] or "") if p
            ).strip()
            or "—",
            gym_name=row[4],
            branch_name=row[5],
            status=row[6],
            price_minor=row[7],
            currency=row[8],
            start_at=row[9],
        )
        for row in sold_rows.all()
    ]
    total_minor = sum(point.revenue_minor for point in series)
    return PlatformRevenueOut(series=series, sold=sold, total_minor=total_minor)
