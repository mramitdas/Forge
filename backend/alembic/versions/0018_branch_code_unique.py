"""per-gym branch code uniqueness

App-level probes in ensure_branch_fields_free give clean 409s, but a
probe/insert race can slip between two requests. Back the rule with a
partial unique index on lower(code) per gym; SoftDelete semantics stay
intact (a soft-deleted branch's code can be reused).

Revision ID: 0018_branch_code_unique
Revises: 0017_permission_catalog_manage
Create Date: 2026-10-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0018_branch_code_unique"
down_revision = "0017_permission_catalog_manage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # if_not_exists: 0001_initial runs Base.metadata.create_all against the
    # CURRENT models, so on a fresh database the model-level index already
    # exists by the time this migration runs.
    op.create_index(
        "uq_branches_gym_code",
        "branches",
        ["gym_id", sa.text("lower(code)")],
        unique=True,
        postgresql_where=sa.text("code IS NOT NULL AND deleted_at IS NULL"),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("uq_branches_gym_code", table_name="branches", if_exists=True)
