"""Fix is_system on editable seeded roles.

The gym-role seed defaulted is_system to True when a template didn't set it,
so editable template roles (Branch Manager, Receptionist, Trainer) were
flagged as system roles and the API refused to disable them
(403 ROLE_LOCKED). Locked system roles (Gym Owner) have is_editable=False
and are unaffected — the update only touches editable roles.

Revision ID: 0020_fix_is_system
Revises: 0019_roles_is_active
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0020_fix_is_system"
down_revision = "0019_roles_is_active"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # roles has FORCE ROW LEVEL SECURITY — without the platform-scope GUC the
    # UPDATE matches zero rows (the owner is still policy-filtered).
    op.execute(sa.text("SELECT set_config('app.platform_scope', 'on', false)"))
    op.execute(
        sa.text("UPDATE roles SET is_system = false WHERE is_editable = true AND is_system = true")
    )


def downgrade() -> None:
    # Data fix — not reversible (the original rows are indistinguishable from
    # correctly-seeded ones without re-querying templates).
    pass
