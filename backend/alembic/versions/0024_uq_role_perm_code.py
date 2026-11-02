"""unique constraint on role_permissions (role_id, permission_code)

Revision ID: 0024 uq role perm code
Revises: 0023_retire_dead_codes
Create Date: 2026-11-02
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0024_uq_role_perm_code"
down_revision = "0023_retire_dead_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))

    # Idempotent: pre-existing DBs may already carry the constraint even when
    # their alembic version is pre-0024.
    exists = bind.execute(
        text(
            "SELECT 1 FROM pg_constraint WHERE conname = 'uq_role_permission_code'"
        )
    ).scalar()
    if exists:
        return

    # Dedup before creating the constraint so legacy duplicate rows cannot
    # make constraint creation fail.
    bind.execute(
        text(
            """
DELETE FROM role_permissions a
USING role_permissions b
WHERE a.role_id = b.role_id
  AND a.permission_code = b.permission_code
  AND a.id > b.id
            """
        )
    )
    op.create_unique_constraint(
        "uq_role_permission_code", "role_permissions", ["role_id", "permission_code"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_role_permission_code", "role_permissions", type_="unique"
    )
