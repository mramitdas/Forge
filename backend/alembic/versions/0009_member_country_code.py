"""member country code

Revision ID: 0009_member_country_code
Revises: 0008_permission_catalog_sync
Create Date: 2026-08-12
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0009_member_country_code"
down_revision = "0008_permission_catalog_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        text(
            "ALTER TABLE members ADD COLUMN IF NOT EXISTS country_code VARCHAR(8)"
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        text("ALTER TABLE members DROP COLUMN IF EXISTS country_code")
    )
