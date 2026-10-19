"""Seed a dev environment: platform user, demo gym, branches, plans.

Idempotent: safe to re-run against a dev database.
Run: python -m scripts.seed_dev
"""

from __future__ import annotations

import asyncio
import uuid

from app.core.config import get_settings
from app.core.security import hash_password
from app.core.tenant import (
    TenantContext,
    reset_tenant_context,
    set_tenant_context,
)
from app.db.session import get_sessionmaker
from app.modules.identity.models import Credential, Role, User, UserRole, split_full_name
from app.modules.identity.permissions import ROLE_TEMPLATES
from app.modules.identity.service import assign_role, seed_platform_roles
from app.modules.membership.service import create_plan
from app.modules.tenancy.models import Branch, Gym
from app.modules.tenancy.service import provision_gym
from sqlalchemy import select

PLATFORM_EMAIL = "admin@gym-erp.dev"
PLATFORM_PASSWORD = "admin-pass-123"
GYM_SLUG = "demo"
GYM_NAME = "Demo Fitness"
OWNER_EMAIL = "demo-owner@gym-erp.dev"
OWNER_NAME = "Demo Owner"
OWNER_PASSWORD = "owner-pass-123"

# Demo gym's default branch. Idempotent by `code`.
DEFAULT_BRANCH = {
    "name": "Main Branch",
    "code": "MAIN",
    "timezone": "Asia/Kolkata",
}

# Demo staff users, one per role template. Emails/passwords for local exploration.
DEMO_STAFF = [
    {
        "role_name": "Branch Manager",
        "email": "branch-manager@gym-erp.dev",
        "full_name": "Branch Manager",
        "password": "manager-pass-123",
    },
    {
        "role_name": "Receptionist",
        "email": "receptionist@gym-erp.dev",
        "full_name": "Front Desk",
        "password": "receptionist-pass-123",
    },
    {
        "role_name": "Trainer",
        "email": "trainer@gym-erp.dev",
        "full_name": "Trainer",
        "password": "trainer-pass-123",
    },
]

PLANS = [
    {
        "name": "Monthly",
        "slug": "monthly",
        "description": "Access for one month",
        "billing_period": "monthly",
        "amount_minor": 150000,  # Rs 1,500
        "entry_fee_minor": 0,
        "tax_rate_bp": 1800,
        "duration_months": 1,
        "auto_renew": True,
    },
    {
        "name": "Quarterly",
        "slug": "quarterly",
        "description": "Access for three months",
        "billing_period": "quarterly",
        "amount_minor": 405000,  # Rs 4,050
        "entry_fee_minor": 0,
        "tax_rate_bp": 1800,
        "duration_months": 3,
        "auto_renew": False,
    },
]


async def seed() -> None:
    settings = get_settings()
    maker = get_sessionmaker()

    # 1. Platform user (idempotent). Context must be set BEFORE session.begin()
    #    so _stamp_tenant records the platform scope.
    ctx = TenantContext(
        tenant_id=uuid.UUID(settings.platform_tenant_id), platform_scope=True
    )
    token = set_tenant_context(ctx)
    try:
        async with maker() as session:
            await session.begin()
            existing = await session.execute(
                select(User.id).where(User.email == PLATFORM_EMAIL)
            )
            if existing.first() is None:
                admin_first, admin_last = split_full_name("Platform Admin")
                user = User(
                    tenant_id=uuid.UUID(settings.platform_tenant_id),
                    email=PLATFORM_EMAIL,
                    full_name="Platform Admin",
                    first_name=admin_first,
                    last_name=admin_last,
                    is_active=True,
                    is_platform=True,
                )
                user.credential = Credential(password_hash=hash_password(PLATFORM_PASSWORD))
                session.add(user)
                print(f"created platform user {PLATFORM_EMAIL}")
            await session.commit()
    finally:
        reset_tenant_context(token)

    # 2. Demo gym (idempotent via slug lookup), provisioned in platform scope.
    ctx = TenantContext(
        tenant_id=uuid.UUID(settings.platform_tenant_id), platform_scope=True
    )
    token = set_tenant_context(ctx)
    try:
        async with maker() as session:
            await session.begin()
            gym_id = await session.scalar(select(Gym.id).where(Gym.slug == GYM_SLUG))
            if gym_id is None:
                gym = await provision_gym(
                    session,
                    name=GYM_NAME,
                    slug=GYM_SLUG,
                    owner_email=OWNER_EMAIL,
                    owner_name=OWNER_NAME,
                    owner_password=OWNER_PASSWORD,
                    tier_code="starter",
                    timezone="Asia/Kolkata",
                    currency="INR",
                )
                gym_id = gym.id
                print(f"provisioned gym {GYM_SLUG} ({gym_id})")
            else:
                print(f"gym {GYM_SLUG} already exists")
            await session.commit()
    finally:
        reset_tenant_context(token)

    # 3. Plans (idempotent by slug), in the gym's tenant scope.
    if gym_id is not None:
        ctx = TenantContext(tenant_id=gym_id, platform_scope=False)
        token = set_tenant_context(ctx)
        try:
            async with maker() as session:
                await session.begin()
                for plan in PLANS:
                    try:
                        await create_plan(session, tenant_id=gym_id, **plan)
                        print(f"created plan {plan['slug']}")
                    except Exception as exc:
                        if getattr(exc, "code", None) == "SLUG_TAKEN":
                            print(f"plan {plan['slug']} already exists")
                        else:
                            raise
                await session.commit()
        finally:
            reset_tenant_context(token)

    # 4. Default branch (idempotent by code), in the gym's tenant scope.
    if gym_id is not None:
        ctx = TenantContext(tenant_id=gym_id, platform_scope=False)
        token = set_tenant_context(ctx)
        try:
            async with maker() as session:
                await session.begin()
                existing = await session.scalar(
                    select(Branch.id).where(
                        Branch.gym_id == gym_id,
                        Branch.code == DEFAULT_BRANCH["code"],
                        Branch.deleted_at.is_(None),
                    )
                )
                if existing is None:
                    session.add(Branch(gym_id=gym_id, **DEFAULT_BRANCH))
                    print(f"created branch {DEFAULT_BRANCH['code']}")
                else:
                    print(f"branch {DEFAULT_BRANCH['code']} already exists")
                await session.commit()
        finally:
            reset_tenant_context(token)

    # 5. Demo staff users, one per role (idempotent by email).
    if gym_id is not None:
        ctx = TenantContext(tenant_id=gym_id, platform_scope=False)
        token = set_tenant_context(ctx)
        try:
            async with maker() as session:
                await session.begin()
                for staff in DEMO_STAFF:
                    existing = await session.execute(
                        select(User.id).where(User.email == staff["email"])
                    )
                    if existing.first() is not None:
                        print(f"staff {staff['email']} already exists")
                        continue
                    role_id = await session.scalar(
                        select(Role.id).where(
                            Role.tenant_id == gym_id,
                            Role.name == staff["role_name"],
                            Role.deleted_at.is_(None),
                        )
                    )
                    if role_id is None:
                        print(f"role {staff['role_name']!r} not found, skipping")
                        continue
                    staff_first, staff_last = split_full_name(staff["full_name"])
                    user = User(
                        tenant_id=gym_id,
                        email=staff["email"],
                        full_name=staff["full_name"],
                        first_name=staff_first,
                        last_name=staff_last,
                        is_active=True,
                        is_platform=False,
                    )
                    user.credential = Credential(
                        password_hash=hash_password(staff["password"])
                    )
                    session.add(user)
                    await session.flush()
                    await assign_role(session, user_id=user.id, role_id=role_id)
                    print(
                        f"created staff {staff['email']} as {staff['role_name']}"
                    )
                await session.commit()
        finally:
            reset_tenant_context(token)

    # 6. Platform Owner role (idempotent by name) assigned to the platform admin.
    ctx = TenantContext(
        tenant_id=uuid.UUID(settings.platform_tenant_id), platform_scope=True
    )
    token = set_tenant_context(ctx)
    try:
        async with maker() as session:
            await session.begin()
            owner_role = await seed_platform_roles(
                session, uuid.UUID(settings.platform_tenant_id)
            )
            admin = await session.scalar(
                select(User).where(User.email == PLATFORM_EMAIL)
            )
            if admin is not None:
                has = await session.scalar(
                    select(UserRole.id).where(
                        UserRole.user_id == admin.id,
                        UserRole.role_id == owner_role.id,
                    )
                )
                if has is None:
                    session.add(UserRole(user_id=admin.id, role_id=owner_role.id))
                    print(f"assigned Platform Owner role to {PLATFORM_EMAIL}")
            await session.commit()
    finally:
        reset_tenant_context(token)

    # 7. Sync role flags from templates (locks Gym Owner, keeps staff editable).
    if gym_id is not None:
        ctx = TenantContext(tenant_id=gym_id, platform_scope=False)
        token = set_tenant_context(ctx)
        try:
            async with maker() as session:
                await session.begin()
                roles = await session.scalars(
                    select(Role).where(
                        Role.tenant_id == gym_id, Role.deleted_at.is_(None)
                    )
                )
                for role in roles:
                    for tpl in ROLE_TEMPLATES.values():
                        if tpl.get("scope", "gym") == "gym" and tpl["name"] == role.name:
                            role.is_editable = tpl.get("is_editable", True)
                            role.is_system = tpl.get("is_system", True)
                            break
                await session.commit()
        finally:
            reset_tenant_context(token)


if __name__ == "__main__":
    asyncio.run(seed())
    print("seed complete")
