"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-01
"""
from __future__ import annotations

from alembic import op
from app.db.base import Base
from app.db.rls import enable_rls
from sqlalchemy import text

# Tables that are NOT tenant-scoped must be excluded from RLS enablement.
NON_TENANT_TABLES = {"outbox_events"}

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Create every table from the ORM metadata.
    Base.metadata.create_all(bind=bind)

    # 2. Seed the global permission catalog (idempotent).
    from app.modules.identity.permissions import PERMISSIONS

    # Seed using raw SQL to stay independent of ORM session semantics.
    for perm in PERMISSIONS:
        bind.execute(
            text(
                "INSERT INTO permission_catalog (code, module, description) "
                "VALUES (:code, :module, :description) ON CONFLICT (code) DO NOTHING"
            ),
            {"code": perm["code"], "module": perm["module"], "description": perm["description"]},
        )

    # 3. Seed subscription tiers.
    tiers = [
        ("starter", "Starter", 1, 250),
        ("pro", "Pro", 10, 10000),
        ("enterprise", "Enterprise", None, None),
    ]
    for code, name, max_branches, max_members in tiers:
        bind.execute(
            text(
                "INSERT INTO subscription_tiers (code, name, max_branches, max_members, limits) "
                "VALUES (:code, :name, :max_branches, :max_members, '{}'::jsonb) "
                "ON CONFLICT (code) DO NOTHING"
            ),
            {
                "code": code,
                "name": name,
                "max_branches": max_branches,
                "max_members": max_members,
            },
        )

    # 4. Enable Row Level Security on every tenant-scoped table.
    for table in Base.metadata.sorted_tables:
        if table.name in NON_TENANT_TABLES:
            continue
        if "tenant_id" in table.columns:
            enable_rls(bind, table.name)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
