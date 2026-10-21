"""roles.is_active — disabled roles keep their assignment but stop granting
permissions; users whose every role is disabled cannot log in or refresh.

Revision ID: 0019_roles_is_active
Revises: 0018_branch_code_unique
Create Date: 2026-10-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0019_roles_is_active"
down_revision = "0018_branch_code_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # if_not_exists: 0001_initial runs Base.metadata.create_all against the
    # CURRENT models, so on a fresh database the model-level column already
    # exists by the time this migration runs.
    op.add_column(
        "roles",
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_column("roles", "is_active")
