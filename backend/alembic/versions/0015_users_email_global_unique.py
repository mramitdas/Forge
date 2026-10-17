"""global active-email uniqueness

The service-level probe in update_me narrows cross-tenant email claims, but
a probe/insert race can slip between the two. Back the app-level rule with a
partial unique index; SoftDelete semantics stay intact (a soft-deleted
email can be re-registered).

Revision ID: 0015_users_email_global_unique
Revises: 0014_expenses
Create Date: 2026-10-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_users_email_global_unique"
down_revision = "0014_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # if_not_exists: 0001_initial runs Base.metadata.create_all against the
    # CURRENT models, so on a fresh database the model-level index already
    # exists by the time this migration runs.
    op.create_index(
        "uq_users_email_active",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("uq_users_email_active", table_name="users", if_exists=True)
