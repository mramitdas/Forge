"""Collapse member status vocabulary to active/inactive/frozen.

Old enum: lead, prospect, active, frozen, lapsed, cancelled.
New enum: active, inactive, frozen.

Mapping: lead/prospect -> active, lapsed/cancelled -> inactive,
active/frozen unchanged. Also rewrites historical
custom_data['branch_frozen_prev'] values stored by the branch
disable/enable flow, otherwise the restore guard
(`previous not in MEMBER_STATUSES`) silently skips them.

Revision ID: 0021_member_status_enum
Revises: 0020_fix_is_system
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0021_member_status_enum"
down_revision = "0020_fix_is_system"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # members has FORCE ROW LEVEL SECURITY — without the platform-scope GUC
    # the UPDATEs match zero rows (same pattern as 0020).
    op.execute(sa.text("SELECT set_config('app.platform_scope', 'on', false)"))
    op.execute(
        sa.text(
            """
            UPDATE members
            SET status = CASE status
                WHEN 'lead' THEN 'active'
                WHEN 'prospect' THEN 'active'
                WHEN 'lapsed' THEN 'inactive'
                WHEN 'cancelled' THEN 'inactive'
                ELSE status
            END
            WHERE status IN ('lead', 'prospect', 'lapsed', 'cancelled')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE members
            SET custom_data = jsonb_set(
                custom_data::jsonb,
                '{branch_frozen_prev}',
                to_jsonb(
                    CASE custom_data->>'branch_frozen_prev'
                        WHEN 'lead' THEN 'active'
                        WHEN 'prospect' THEN 'active'
                        WHEN 'lapsed' THEN 'inactive'
                        WHEN 'cancelled' THEN 'inactive'
                        ELSE custom_data->>'branch_frozen_prev'
                    END
                )
            )::json
            WHERE custom_data->>'branch_frozen_prev'
                  IN ('lead', 'prospect', 'lapsed', 'cancelled')
            """
        )
    )


def downgrade() -> None:
    # Data migration — not reversible: the collapsed vocabulary cannot
    # distinguish the original six values.
    pass
