"""Dev fixtures for e2e/demo: demo gym, owner, plans, branch. Run after make seed. Idempotent.
"""

from __future__ import annotations

import asyncio
import uuid

from app.core.config import get_settings
from app.core.tenant import (
    TenantContext,
    reset_tenant_context,
    set_tenant_context,
)
from app.db.session import get_sessionmaker
from app.modules.identity.models import Role
from app.modules.identity.permissions import ROLE_TEMPLATES
from app.modules.membership.service import create_plan
from app.modules.tenancy.models import Branch, Gym
from app.modules.tenancy.service import provision_gym
from sqlalchemy import select

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


async def seed_fixtures() -> None:
    settings = get_settings()
    maker = get_sessionmaker()

    # 1. Demo gym (idempotent via slug lookup), provisioned in platform scope.
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

    # 2. Plans (idempotent by slug), in the gym's tenant scope.
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

    # 3. Default branch (idempotent by code), in the gym's tenant scope.
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

    # 4. Sync role flags from templates (locks Gym Owner).
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
    asyncio.run(seed_fixtures())
    print("fixtures complete")
