"""branch country code

Revision ID: 0005_branch_country_code
Revises: 0004_tier_pricing
Create Date: 2026-08-11
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0005_branch_country_code"
down_revision = "0004_tier_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        text(
            "ALTER TABLE branches ADD COLUMN IF NOT EXISTS country_code "
            "VARCHAR(8)"
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        text("ALTER TABLE branches DROP COLUMN IF EXISTS country_code")
    )
