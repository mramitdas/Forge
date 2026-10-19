"""users first_name / last_name columns

Split the single full_name column into first_name + last_name (members
module pattern). full_name stays as the denormalized display column,
recomputed by the app on every name write. Existing rows are backfilled
by splitting on the first space; single-word names land entirely in
first_name.

Revision ID: 0016_users_first_last_name
Revises: 0015_users_email_global_unique
Create Date: 2026-10-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_users_first_last_name"
down_revision = "0015_users_email_global_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # if_not_exists: 0001_initial runs Base.metadata.create_all against the
    # CURRENT models, so on a fresh database these columns already exist by
    # the time this migration runs.
    op.add_column(
        "users",
        sa.Column("first_name", sa.String(100), nullable=False, server_default=""),
        if_not_exists=True,
    )
    op.add_column(
        "users",
        sa.Column("last_name", sa.String(100), nullable=False, server_default=""),
        if_not_exists=True,
    )
    # users has FORCE ROW LEVEL SECURITY; the backfill UPDATE needs
    # platform_scope to see every tenant's rows (same as 0002/0012/0014).
    bind.execute(sa.text("SELECT set_config('app.platform_scope', 'on', false)"))
    op.execute(
        """
        UPDATE users SET
          first_name = split_part(full_name, ' ', 1),
          last_name = CASE
            WHEN position(' ' IN full_name) > 0
            THEN substring(full_name FROM position(' ' IN full_name) + 1)
            ELSE ''
          END
        """
    )


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
