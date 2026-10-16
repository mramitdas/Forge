from __future__ import annotations

from app.modules.identity.permissions import ROLE_TEMPLATES, template_permission_codes


def test_receptionist_template_includes_checkin_history_and_branches() -> None:
    """Front desk must be able to read attendance history and branch context.

    The nav shows Check-ins for `attendance.checkin`, and the overview fetches
    branches — without these two codes the receptionist lands on 403 error
    cards.
    """
    codes = template_permission_codes(ROLE_TEMPLATES["receptionist"])
    assert "attendance.checkin" in codes
    assert "attendance.records.view" in codes
    assert "tenancy.branches.view" in codes


def test_receptionist_template_does_not_grant_destructive_codes() -> None:
    codes = template_permission_codes(ROLE_TEMPLATES["receptionist"])
    assert "members.delete" not in codes
    assert "tenancy.branches.delete" not in codes
    assert "roles.manage" not in codes


def test_trainer_template_includes_branch_context() -> None:
    """Trainers read check-in rows; without branches.view those rows and the
    overview occupancy card degrade to "Unknown branch" and hidden cards."""
    codes = template_permission_codes(ROLE_TEMPLATES["trainer"])
    assert "tenancy.branches.view" in codes
    assert "attendance.records.view" in codes
    assert "attendance.checkin" in codes
    assert "tenancy.branches.update" not in codes
    assert "tenancy.branches.delete" not in codes
