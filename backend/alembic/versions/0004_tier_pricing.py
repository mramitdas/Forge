"""tier monthly pricing

Revision ID: 0004_tier_pricing
Revises: 0003_platform_subscriptions
Create Date: 2026-08-10
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0004_tier_pricing"
down_revision = "0003_platform_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        text(
            "ALTER TABLE subscription_tiers ADD COLUMN IF NOT EXISTS price_minor "
            "BIGINT"
        )
    )
    seed = [
        ("starter", 299),
        ("pro", 799),
        ("enterprise", 1499),
    ]
    for code, price in seed:
        bind.execute(
            text(
                "UPDATE subscription_tiers SET price_minor = :price "
                "WHERE code = :code AND price_minor IS NULL"
            ),
            {"code": code, "price": price},
        )


def downgrade() -> None:
    op.get_bind().execute(
        text("ALTER TABLE subscription_tiers DROP COLUMN IF EXISTS price_minor")
    )
