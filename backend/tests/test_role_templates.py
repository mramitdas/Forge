from __future__ import annotations

from app.modules.identity.permissions import (
    PERMISSIONS,
    ROLE_TEMPLATES,
    template_permission_codes,
)

GYM_MODULES = {
    "attendance",
    "billing",
    "expenses",
    "identity",
    "members",
    "membership",
    "notifications",
    "tenancy",
}
VIEW_ONLY_MODULES = {"notifications"}


def _expected_gym_codes() -> set[str]:
    return {
        f"{module}.{capability}"
        for module in GYM_MODULES
        for capability in (
            ("view",) if module in VIEW_ONLY_MODULES else ("view", "manage")
        )
    }


def test_only_owner_templates_remain() -> None:
    assert set(ROLE_TEMPLATES) == {"platform_owner", "gym_owner"}


def test_gym_owner_has_view_and_manage_for_every_module() -> None:
    codes = template_permission_codes(ROLE_TEMPLATES["gym_owner"])
    assert set(codes) == _expected_gym_codes()
    assert len(codes) == 15


def test_dead_codes_are_retired() -> None:
    codes = {p["code"] for p in PERMISSIONS}
    assert not codes & {"reports.view", "reports.manage", "notifications.manage"}


def test_platform_owner_stays_platform_only() -> None:
    codes = template_permission_codes(ROLE_TEMPLATES["platform_owner"])
    assert codes
    assert all(code.startswith("platform.") for code in codes)


def test_gym_catalog_matches_module_capabilities() -> None:
    gym_codes = [p["code"] for p in PERMISSIONS if not p["code"].startswith("platform.")]
    assert sorted(gym_codes) == sorted(_expected_gym_codes())
