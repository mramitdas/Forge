"""member account flags and avatar

Revision ID: 0010_member_account
Revises: 0009_member_country_code
Create Date: 2026-08-14
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0010_member_account"
down_revision = "0009_member_country_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        text(
            "ALTER TABLE members ADD COLUMN IF NOT EXISTS is_active "
            "BOOLEAN NOT NULL DEFAULT TRUE"
        )
    )
    bind.execute(
        text(
            "ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(255)"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("ALTER TABLE members DROP COLUMN IF EXISTS avatar_path"))
    bind.execute(text("ALTER TABLE members DROP COLUMN IF EXISTS is_active"))
