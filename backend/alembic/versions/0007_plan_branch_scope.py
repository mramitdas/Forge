"""plan branch scope

Revision ID: 0007_plan_branch_scope
Revises: 0006_permission_catalog_sync
Create Date: 2026-08-11
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0007_plan_branch_scope"
down_revision = "0006_permission_catalog_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # NULL branch_id means the plan is common to every branch of the gym.
    bind.execute(
        text(
            "ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS branch_id UUID "
            "REFERENCES branches (id) ON DELETE RESTRICT"
        )
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_membership_plans_branch_id "
            "ON membership_plans (branch_id)"
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        text("ALTER TABLE membership_plans DROP COLUMN IF EXISTS branch_id")
    )
