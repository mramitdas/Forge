"""outbox_events.claimed_at column for lease-based multi-instance claiming

Revision ID: 0025_outbox_claimed_at
Revises: 0024_uq_role_perm_code
Create Date: 2026-11-04
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0025_outbox_claimed_at"
down_revision = "0024_uq_role_perm_code"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))

    # Idempotent: pre-existing DBs may already carry the column even when
    # their alembic version is pre-0025.
    exists = bind.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'outbox_events' AND column_name = 'claimed_at'"
        )
    ).scalar()
    if exists:
        return

    # Nullable: unset means unclaimed. NULL rows are delivered by the claim
    # query; no index needed at current fan-out sizes.
    op.execute(
        text("ALTER TABLE outbox_events ADD COLUMN claimed_at TIMESTAMPTZ NULL")
    )


def downgrade() -> None:
    op.drop_column("outbox_events", "claimed_at")
