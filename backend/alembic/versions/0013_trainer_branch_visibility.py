"""backfill trainer role with branch visibility

Trainers read check-in rows and the overview occupancy card; without
tenancy.branches.view those rows say "Unknown branch" and the occupancy card is
hidden. Existing gym roles were provisioned from the old template, so backfill
them here (same pattern as 0012_receptionist_visibility).

Revision ID: 0013_trainer_branch_visibility
Revises: 0012_receptionist_visibility
Create Date: 2026-10-15
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0013_trainer_branch_visibility"
down_revision = "0012_receptionist_visibility"
branch_labels = None
depends_on = None

_CODE = "tenancy.branches.view"


def upgrade() -> None:
    bind = op.get_bind()
    # Run in platform scope so the tenant RLS policy does not hide any gym's
    # roles (same pattern as 0012_receptionist_visibility).
    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))
    bind.execute(
        text(
            "INSERT INTO role_permissions (id, role_id, permission_code, branch_scope) "
            "SELECT gen_random_uuid(), r.id, CAST(:code AS VARCHAR(128)), 'all' "
            "FROM roles r "
            "WHERE r.name = 'Trainer' "
            "  AND r.deleted_at IS NULL "
            "  AND NOT EXISTS ("
            "    SELECT 1 FROM role_permissions rp "
            "    WHERE rp.role_id = r.id "
            "      AND rp.permission_code = CAST(:code AS VARCHAR(128))"
            "  )"
        ),
        {"code": _CODE},
    )


def downgrade() -> None:
    # Additive backfill; removing the rows would hide branch names on existing
    # trainer views. Safe to leave in place.
    pass
