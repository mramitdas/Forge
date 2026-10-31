"""retire dead gym permission codes (reports.*, notifications.manage)

Revision ID: 0023_retire_dead_codes
Revises: 0022_two_tier_permissions
Create Date: 2026-10-28
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0023_retire_dead_codes"
down_revision = "0022_two_tier_permissions"
branch_labels = None
depends_on = None

DEAD_CODES = ("reports.view", "reports.manage", "notifications.manage")


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))

    # Grants first (FK), then the catalog rows.
    bind.execute(
        text("DELETE FROM role_permissions WHERE permission_code = ANY(:codes)"),
        {"codes": list(DEAD_CODES)},
    )
    bind.execute(
        text("DELETE FROM permission_catalog WHERE code = ANY(:codes)"),
        {"codes": list(DEAD_CODES)},
    )


def downgrade() -> None:
    # Retired codes are not restored; the catalog is authoritative in code.
    pass
