from __future__ import annotations

from tests.helpers import login, provision_gym


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _role(client, owner_headers: dict, name: str, codes: list[str]) -> dict:
    created = await client.post(
        "/api/v1/permissions/roles",
        headers=owner_headers,
        json={"name": name, "permission_codes": codes},
    )
    assert created.status_code == 201, created.text
    return created.json()


async def test_update_role_rename_and_disable_blocks_login(client, platform_token):
    await provision_gym(client, platform_token, "roledis")
    owner = await login(client, "owner-roledis@example.com", "owner-pass-123")
    oh = _h(owner["access_token"])

    role = await _role(client, oh, "Flex Role", ["members.view"])

    renamed = await client.patch(
        f"/api/v1/permissions/roles/{role['id']}",
        headers=oh,
        json={
            "name": "Renamed Role",
            "description": "name is editable now",
            "permission_codes": ["members.view"],
        },
    )
    assert renamed.status_code == 200, renamed.text
    body = renamed.json()
    assert body["name"] == "Renamed Role"
    assert body["description"] == "name is editable now"
    assert body["is_active"] is True

    emp = await client.post(
        "/api/v1/employees",
        headers=oh,
        json={
            "email": "staff-roledis@example.com",
            "full_name": "Staff",
            "password": "staff-pass-123",
            "role_ids": [role["id"]],
        },
    )
    assert emp.status_code == 201, emp.text

    staff_tokens = await login(client, "staff-roledis@example.com", "staff-pass-123")
    staff_h = _h(staff_tokens["access_token"])
    me = await client.get("/api/v1/auth/me", headers=staff_h)
    assert me.status_code == 200
    assert "members.view" in me.json()["permissions"]

    disabled = await client.patch(
        f"/api/v1/permissions/roles/{role['id']}",
        headers=oh,
        json={"permission_codes": ["members.view"], "is_active": False},
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["is_active"] is False

    blocked = await client.post(
        "/api/v1/auth/login",
        json={"email": "staff-roledis@example.com", "password": "staff-pass-123"},
    )
    assert blocked.status_code == 403, blocked.text
    assert blocked.json()["error"]["code"] == "ROLE_DISABLED"

    # In-flight token stays valid but the session goes powerless.
    me_after = await client.get("/api/v1/auth/me", headers=staff_h)
    assert me_after.status_code == 200
    assert me_after.json()["permissions"] == []

    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": staff_tokens["refresh_token"]}
    )
    assert refreshed.status_code == 403, refreshed.text
    assert refreshed.json()["error"]["code"] == "ROLE_DISABLED"

    reenabled = await client.patch(
        f"/api/v1/permissions/roles/{role['id']}",
        headers=oh,
        json={"permission_codes": ["members.view"], "is_active": True},
    )
    assert reenabled.status_code == 200, reenabled.text
    again = await login(client, "staff-roledis@example.com", "staff-pass-123")
    assert again["access_token"]


async def test_zero_role_user_still_logs_in(client, platform_token):
    # Disabling every role blocks login — but a user with no roles at all
    # keeps the existing powerless-but-logged-in behavior.
    await provision_gym(client, platform_token, "norole")
    owner = await login(client, "owner-norole@example.com", "owner-pass-123")
    oh = _h(owner["access_token"])

    emp = await client.post(
        "/api/v1/employees",
        headers=oh,
        json={
            "email": "lonely-norole@example.com",
            "full_name": "Lonely",
            "password": "staff-pass-123",
            "role_ids": [],
        },
    )
    assert emp.status_code == 201, emp.text

    tokens = await login(client, "lonely-norole@example.com", "staff-pass-123")
    me = await client.get("/api/v1/auth/me", headers=_h(tokens["access_token"]))
    assert me.status_code == 200
    assert me.json()["permissions"] == []


async def test_system_role_cannot_be_disabled(client, platform_token):
    await provision_gym(client, platform_token, "sysrole")
    owner = await login(client, "owner-sysrole@example.com", "owner-pass-123")
    oh = _h(owner["access_token"])

    listed = (await client.get("/api/v1/permissions/roles", headers=oh)).json()
    gym_owner = next(r for r in listed if r["name"] == "Gym Owner")
    assert gym_owner["is_system"] is True
    assert gym_owner["is_editable"] is False
    assert gym_owner["is_active"] is True

    blocked = await client.patch(
        f"/api/v1/permissions/roles/{gym_owner['id']}",
        headers=oh,
        json={"permission_codes": gym_owner["permission_codes"], "is_active": False},
    )
    assert blocked.status_code == 422, blocked.text
    assert blocked.json()["error"]["code"] == "ROLE_LOCKED"
