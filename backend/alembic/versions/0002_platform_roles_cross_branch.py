"""platform owner role catalog + gym cross-branch access

Revision ID: 0002_platform_roles_cross_branch
Revises: 0001_initial
Create Date: 2026-08-06
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "0002_platform_roles_cross_branch"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Gym-wide "members may use any branch" toggle.
    bind.execute(
        text(
            "ALTER TABLE gyms ADD COLUMN IF NOT EXISTS cross_branch_access "
            "BOOLEAN NOT NULL DEFAULT FALSE"
        )
    )

    # 2. Extend the global permission catalog with platform-scoped codes.
    platform_perms = [
        (
            "platform.gyms.create",
            "platform",
            "Provision a new gym",
        ),
        (
            "platform.gyms.view",
            "platform",
            "View gym registry",
        ),
        (
            "platform.gyms.update",
            "platform",
            "Update gym settings",
        ),
        (
            "platform.owners.manage",
            "platform",
            "Manage gym owners",
        ),
        (
            "platform.subscriptions.view",
            "platform",
            "View gym subscriptions and tiers",
        ),
        (
            "platform.subscriptions.manage",
            "platform",
            "Change gym tiers and billing",
        ),
        (
            "platform.sales.view",
            "platform",
            "View platform sales and revenue",
        ),
        (
            "platform.reports.view",
            "platform",
            "View platform-wide reports",
        ),
        (
            "platform.settings.manage",
            "platform",
            "Manage platform settings",
        ),
    ]
    for code, module, description in platform_perms:
        bind.execute(
            text(
                "INSERT INTO permission_catalog (code, module, description) "
                "VALUES (:code, :module, :description) ON CONFLICT (code) DO NOTHING"
            ),
            {"code": code, "module": module, "description": description},
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("ALTER TABLE gyms DROP COLUMN IF EXISTS cross_branch_access"))
    # role_permissions (from 0001) references these catalog codes — remove the
    # grants first or the catalog DELETE hits a foreign-key violation.
    bind.execute(text("SELECT set_config('app.platform_scope', 'on', false)"))
    for code, _module, _description in [
        ("platform.gyms.create", "platform", "Provision a new gym"),
        ("platform.gyms.view", "platform", "View gym registry"),
        ("platform.gyms.update", "platform", "Update gym settings"),
        ("platform.owners.manage", "platform", "Manage gym owners"),
        ("platform.subscriptions.view", "platform", "View gym subscriptions and tiers"),
        ("platform.subscriptions.manage", "platform", "Change gym tiers and billing"),
        ("platform.sales.view", "platform", "View platform sales and revenue"),
        ("platform.reports.view", "platform", "View platform-wide reports"),
        ("platform.settings.manage", "platform", "Manage platform settings"),
    ]:
        bind.execute(
            text("DELETE FROM role_permissions WHERE permission_code = :code"),
            {"code": code},
        )
        bind.execute(
            text("DELETE FROM permission_catalog WHERE code = :code"),
            {"code": code},
        )
