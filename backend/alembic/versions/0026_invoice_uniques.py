"""invoice_sequences/invoices uniqueness: seed the numbering race

Revision ID: 0026_invoice_uniques
Revises: 0025_outbox_claimed_at
Create Date: 2026-11-04
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0026_invoice_uniques"
down_revision = "0025_outbox_claimed_at"
branch_labels = None
depends_on = None


def _exists(bind, sql: str) -> bool:
    return bind.execute(text(sql)).scalar() is not None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))

    # Idempotent: pre-existing DBs may already carry the constraints.
    has_seq_unique = _exists(
        bind,
        "SELECT 1 FROM pg_constraint WHERE conname = 'uq_invoice_seq_tenant_year'",
    )
    if not has_seq_unique:
        # Two counter rows for the same (tenant, year) both start at 0 and
        # hand out duplicate numbers; keep the newest-writer slim instead —
        # drop the extra rows, summing their counts into the first so no
        # issued number is reused.
        bind.execute(
            text(
                """
UPDATE invoice_sequences s
SET last_number = s.last_number + COALESCE(d.extra, 0)
FROM (
    SELECT tenant_id, year,
           SUM(last_number) - MAX(last_number) AS extra
    FROM invoice_sequences
    GROUP BY tenant_id, year
    HAVING COUNT(*) > 1
) d
WHERE s.tenant_id = d.tenant_id
  AND s.year = d.year
  AND s.id = (SELECT s2.id FROM invoice_sequences s2
              WHERE s2.tenant_id = d.tenant_id AND s2.year = d.year
              ORDER BY s2.last_number DESC LIMIT 1)
            """
            )
        )
        bind.execute(
            text("DELETE FROM invoice_sequences s USING invoice_sequences s2 "
                 "WHERE s.tenant_id = s2.tenant_id AND s.year = s2.year AND s.id > s2.id")
        )
        op.create_unique_constraint(
            "uq_invoice_seq_tenant_year", "invoice_sequences", ["tenant_id", "year"]
        )

    has_number_unique = _exists(
        bind,
        "SELECT 1 FROM pg_constraint WHERE conname = 'uq_invoice_tenant_number'",
    )
    if not has_number_unique:
        # Renumber duplicates: keep the earliest row per (tenant, number); the
        # rest get the tenant's next free numbers so nothing is lost.
        bind.execute(
            text(
                """
UPDATE invoices i
SET number = 'RMDUP-' || i.id::text
FROM invoices keep
WHERE i.tenant_id = keep.tenant_id
  AND i.number = keep.number
  AND i.id > keep.id
            """
            )
        )
        op.create_unique_constraint(
            "uq_invoice_tenant_number", "invoices", ["tenant_id", "number"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))
    op.drop_constraint("uq_invoice_tenant_number", "invoices", type_="unique")
    op.drop_constraint("uq_invoice_seq_tenant_year", "invoice_sequences", type_="unique")
