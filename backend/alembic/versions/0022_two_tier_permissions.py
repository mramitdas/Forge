"""replace granular gym permissions with view/manage and reset gym roles

Revision ID: 0022_two_tier_permissions
Revises: 0021_member_status_enum
Create Date: 2026-10-27
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0022_two_tier_permissions"
down_revision = "0021_member_status_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    from app.modules.identity.permissions import PERMISSIONS

    gym_codes = [p["code"] for p in PERMISSIONS if not p["code"].startswith("platform.")]

    # Platform-approved destructive reset: every gym role except the locked Gym
    # Owner is dropped, and the owner is rebuilt from the two-tier catalog.
    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))

    platform_tenant = bind.execute(
        text("SELECT tenant_id FROM users WHERE is_platform = true LIMIT 1")
    ).scalar()

    if platform_tenant is not None:
        bind.execute(
            text(
                "DELETE FROM user_roles ur USING roles r "
                "WHERE ur.role_id = r.id "
                "  AND r.tenant_id <> :platform_tenant "
                "  AND r.name <> 'Gym Owner'"
            ),
            {"platform_tenant": platform_tenant},
        )
        bind.execute(
            text(
                "DELETE FROM roles "
                "WHERE tenant_id <> :platform_tenant AND name <> 'Gym Owner'"
            ),
            {"platform_tenant": platform_tenant},
        )

    # Drop every gym permission assignment, then the retired catalog codes.
    bind.execute(
        text("DELETE FROM role_permissions WHERE permission_code NOT LIKE 'platform.%'")
    )
    bind.execute(
        text("DELETE FROM permission_catalog WHERE code NOT LIKE 'platform.%'")
    )

    for perm in PERMISSIONS:
        bind.execute(
            text(
                "INSERT INTO permission_catalog (code, module, description) "
                "VALUES (:code, :module, :description) ON CONFLICT (code) DO NOTHING"
            ),
            {"code": perm["code"], "module": perm["module"], "description": perm["description"]},
        )

    # Rebuild each gym's locked owner role with all 18 gym capabilities.
    bind.execute(
        text(
            "INSERT INTO role_permissions (id, role_id, permission_code, branch_scope) "
            "SELECT gen_random_uuid(), r.id, p.code, 'all' "
            "FROM roles r "
            "CROSS JOIN permission_catalog p "
            "WHERE r.name = 'Gym Owner' "
            "  AND r.deleted_at IS NULL "
            "  AND p.code = ANY(:codes) "
            "  AND NOT EXISTS ("
            "    SELECT 1 FROM role_permissions rp "
            "    WHERE rp.role_id = r.id AND rp.permission_code = p.code"
            "  )"
        ),
        {"codes": gym_codes},
    )


def downgrade() -> None:
    # Destructive by design: retired roles and granular codes are not restored.
    pass
