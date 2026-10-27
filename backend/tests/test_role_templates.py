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
    "reports",
    "tenancy",
}


def test_only_owner_templates_remain() -> None:
    assert set(ROLE_TEMPLATES) == {"platform_owner", "gym_owner"}


def test_gym_owner_has_view_and_manage_for_every_module() -> None:
    codes = template_permission_codes(ROLE_TEMPLATES["gym_owner"])
    expected = {
        f"{module}.{capability}"
        for module in GYM_MODULES
        for capability in ("view", "manage")
    }
    assert set(codes) == expected
    assert len(codes) == 18


def test_platform_owner_stays_platform_only() -> None:
    codes = template_permission_codes(ROLE_TEMPLATES["platform_owner"])
    assert codes
    assert all(code.startswith("platform.") for code in codes)


def test_gym_catalog_has_exactly_two_capabilities_per_module() -> None:
    gym_codes = [p["code"] for p in PERMISSIONS if not p["code"].startswith("platform.")]
    assert sorted(gym_codes) == sorted(
        f"{module}.{capability}" for module in GYM_MODULES for capability in ("view", "manage")
    )
