"""backfill receptionist role with check-in history and branch visibility

Receptionists can record check-ins (attendance.checkin) and the UI shows them
the Check-ins nav plus overview branch cards, but the role template never
granted attendance.records.view or tenancy.branches.view — every read came back
403. Existing gym roles were provisioned from the old template, so backfill
them here.

Revision ID: 0012_receptionist_visibility
Revises: 0011_branch_gst_number
Create Date: 2026-10-15
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0012_receptionist_visibility"
down_revision = "0011_branch_gst_number"
branch_labels = None
depends_on = None

_CODES = ("attendance.records.view", "tenancy.branches.view")


def upgrade() -> None:
    bind = op.get_bind()
    # Run in platform scope so the tenant RLS policy does not hide any gym's
    # roles (same pattern as 0008_permission_catalog_sync).
    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))
    for code in _CODES:
        bind.execute(
            text(
                "INSERT INTO role_permissions (id, role_id, permission_code, branch_scope) "
                "SELECT gen_random_uuid(), r.id, CAST(:code AS VARCHAR(128)), 'all' "
                "FROM roles r "
                "WHERE r.name = 'Receptionist' "
                "  AND r.deleted_at IS NULL "
                "  AND NOT EXISTS ("
                "    SELECT 1 FROM role_permissions rp "
                "    WHERE rp.role_id = r.id "
                "      AND rp.permission_code = CAST(:code AS VARCHAR(128))"
                "  )"
            ),
            {"code": code},
        )


def downgrade() -> None:
    # Additive backfill; removing the rows would break receptionist check-in
    # history views on downgrade. Safe to leave in place.
    pass
