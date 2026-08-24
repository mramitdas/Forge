"""branch gst number

Revision ID: 0011_branch_gst_number
Revises: 0010_member_account
Create Date: 2026-08-17
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0011_branch_gst_number"
down_revision = "0010_member_account"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        text(
            "ALTER TABLE branches ADD COLUMN IF NOT EXISTS gst_number VARCHAR(32)"
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        text("ALTER TABLE branches DROP COLUMN IF EXISTS gst_number")
    )
