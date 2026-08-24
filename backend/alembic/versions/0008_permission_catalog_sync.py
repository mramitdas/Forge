"""sync permission catalog for membership.plans.delete

Revision ID: 0008_permission_catalog_sync
Revises: 0007_plan_branch_scope
Create Date: 2026-08-11
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0008_permission_catalog_sync"
down_revision = "0007_plan_branch_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Bring the catalog up to date with every permission known to the code.
    from app.modules.identity.permissions import PERMISSIONS

    for perm in PERMISSIONS:
        bind.execute(
            text(
                "INSERT INTO permission_catalog (code, module, description) "
                "VALUES (:code, :module, :description) ON CONFLICT (code) DO NOTHING"
            ),
            {"code": perm["code"], "module": perm["module"], "description": perm["description"]},
        )

    # 2. Re-expand locked "all"-scope gym roles so owners gain the newly
    #    catalogued membership.plans.delete permission. Run in platform scope
    #    so the tenant RLS policy does not hide any gym's roles.
    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))
    bind.execute(
        text(
            "INSERT INTO role_permissions (id, role_id, permission_code, branch_scope) "
            "SELECT gen_random_uuid(), r.id, p.code, 'all' "
            "FROM roles r "
            "CROSS JOIN permission_catalog p "
            "WHERE r.name = 'Gym Owner' "
            "  AND r.deleted_at IS NULL "
            "  AND p.code NOT LIKE 'platform.%' "
            "  AND NOT EXISTS ("
            "    SELECT 1 FROM role_permissions rp "
            "    WHERE rp.role_id = r.id AND rp.permission_code = p.code"
            "  )"
        )
    )


def downgrade() -> None:
    # The catalog and role expansion are additive and safe to leave in place.
    pass
