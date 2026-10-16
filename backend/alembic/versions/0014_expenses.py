"""expenses table + expense permission codes

Adds the gym expenses ledger (rent, salaries, utilities — the data the legacy
GMS tracked in app_expense) plus the two catalog codes that gate it. Existing
Gym Owner / Branch Manager roles predate the codes, so backfill their grants.

Revision ID: 0014_expenses
Revises: 0013_trainer_branch_visibility
Create Date: 2026-10-16
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_expenses"
down_revision = "0013_trainer_branch_visibility"
branch_labels = None
depends_on = None

_CODES = (
    ("expenses.view", "View expenses"),
    ("expenses.manage", "Record and delete expenses"),
)
_GRANT_ROLES = {
    "Gym Owner": ("expenses.view", "expenses.manage"),
    "Branch Manager": ("expenses.view", "expenses.manage"),
}


def upgrade() -> None:
    bind = op.get_bind()
    op.create_table(
        "expenses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "branch_id",
            sa.Uuid(),
            sa.ForeignKey("branches.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("method", sa.String(20), nullable=False, server_default="cash"),
        sa.Column(
            "paid_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            nullable=False,
            server_default=sa.text("NULLIF(current_setting('app.tenant_id', true), '')::uuid"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
    )
    op.create_index("ix_expenses_tenant_id", "expenses", ["tenant_id"])
    op.create_index("ix_expenses_branch_id", "expenses", ["branch_id"])
    op.create_index("ix_expenses_category", "expenses", ["category"])
    op.create_index("ix_expenses_paid_at", "expenses", ["paid_at"])

    bind.execute(sa.text("SELECT set_config('app.platform_scope', 'on', false)"))
    for code, description in _CODES:
        bind.execute(
            sa.text(
                "INSERT INTO permission_catalog (code, module, description) "
                "VALUES (:code, 'expenses', :description) ON CONFLICT (code) DO NOTHING"
            ),
            {"code": code, "description": description},
        )
    for role_name, codes in _GRANT_ROLES.items():
        for code in codes:
            bind.execute(
                sa.text(
                    "INSERT INTO role_permissions (id, role_id, permission_code, branch_scope) "
                    "SELECT gen_random_uuid(), r.id, CAST(:code AS VARCHAR(128)), 'all' "
                    "FROM roles r "
                    "WHERE r.name = :role_name "
                    "  AND r.deleted_at IS NULL "
                    "  AND NOT EXISTS ("
                    "    SELECT 1 FROM role_permissions rp "
                    "    WHERE rp.role_id = r.id "
                    "      AND rp.permission_code = CAST(:code AS VARCHAR(128))"
                    "  )"
                ),
                {"code": code, "role_name": role_name},
            )


def downgrade() -> None:
    op.drop_table("expenses")
    # permission_catalog / role_permissions rows stay: removing them would
    # break role editing screens. Safe to leave in place.
