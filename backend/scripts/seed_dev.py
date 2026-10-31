"""Seed the platform admin only (frontend fixtures live in seed_fixtures).

Idempotent: safe to re-run against a dev database.
Run: python -m scripts.seed_dev
"""

from __future__ import annotations

import asyncio
import uuid

from app.core.config import get_settings
from app.core.security import hash_password, password_rule_failures
from app.core.tenant import (
    TenantContext,
    reset_tenant_context,
    set_tenant_context,
)
from app.db.session import get_sessionmaker
from app.modules.identity.models import Credential, User, UserRole, split_full_name
from app.modules.identity.service import seed_platform_roles
from sqlalchemy import select


async def seed() -> None:
    settings = get_settings()
    admin_email = settings.platform_admin_email.strip()
    admin_password = settings.platform_admin_password
    if not admin_email or not admin_password:
        raise SystemExit(
            "seed_dev: platform admin credentials missing. Set both "
            "GYM_PLATFORM_ADMIN_EMAIL and GYM_PLATFORM_ADMIN_PASSWORD "
            "(backend/.env) before running seed."
        )
    failures = password_rule_failures(admin_password)
    if failures:
        raise SystemExit(
            "seed_dev: GYM_PLATFORM_ADMIN_PASSWORD is too weak — failed "
            f"rules: {', '.join(failures)}."
        )
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
                select(User.id).where(User.email == admin_email)
            )
            if existing.first() is None:
                admin_first, admin_last = split_full_name("Platform Admin")
                user = User(
                    tenant_id=uuid.UUID(settings.platform_tenant_id),
                    email=admin_email,
                    full_name="Platform Admin",
                    first_name=admin_first,
                    last_name=admin_last,
                    is_active=True,
                    is_platform=True,
                )
                user.credential = Credential(password_hash=hash_password(admin_password))
                session.add(user)
                print(f"created platform user {admin_email}")
            await session.commit()
    finally:
        reset_tenant_context(token)

    # 2. Platform Owner role (idempotent by name) assigned to the platform admin.
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
                select(User).where(User.email == admin_email)
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
                    print(f"assigned Platform Owner role to {admin_email}")
            await session.commit()
    finally:
        reset_tenant_context(token)


if __name__ == "__main__":
    asyncio.run(seed())
    print("seed complete")
