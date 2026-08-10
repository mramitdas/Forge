"""platform subscription tier catalog + subscription activity audit

Revision ID: 0003_platform_subscriptions
Revises: 0002_platform_roles_cross_branch
Create Date: 2026-08-09
"""
from __future__ import annotations

from alembic import op
from app.db.base import Base
from sqlalchemy import text

revision = "0003_platform_subscriptions"
down_revision = "0002_platform_roles_cross_branch"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Tier catalog: human-readable description + enable/disable switch.
    bind.execute(
        text(
            "ALTER TABLE subscription_tiers ADD COLUMN IF NOT EXISTS description TEXT"
        )
    )
    bind.execute(
        text(
            "ALTER TABLE subscription_tiers ADD COLUMN IF NOT EXISTS is_active "
            "BOOLEAN NOT NULL DEFAULT TRUE"
        )
    )

    # 2. Create any ORM tables that don't exist yet (idempotent): the audit log
    #    that records who provisioned / changed a gym's platform subscription.
    Base.metadata.create_all(bind=bind)

    # 3. Backfill descriptions for the seeded catalog.
    seed = [
        (
            "starter",
            "Single branch and up to 250 members — the entry plan for a new gym.",
        ),
        (
            "pro",
            "Up to 10 branches and 10,000 members for growing operators.",
        ),
        (
            "enterprise",
            "Unlimited branches and members with priority support.",
        ),
    ]
    for code, description in seed:
        bind.execute(
            text(
                "UPDATE subscription_tiers SET description = :description "
                "WHERE code = :code AND description IS NULL"
            ),
            {"code": code, "description": description},
        )

    # 4. App role privileges for the new table (schema-wide grants only cover
    #    tables that existed when 0001 ran).
    bind.execute(
        text("GRANT SELECT, INSERT, UPDATE, DELETE ON gym_subscription_events TO gym")
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("DROP TABLE IF EXISTS gym_subscription_events"))
    bind.execute(text("ALTER TABLE subscription_tiers DROP COLUMN IF EXISTS description"))
    bind.execute(text("ALTER TABLE subscription_tiers DROP COLUMN IF EXISTS is_active"))
