from __future__ import annotations

from tests.helpers import login, provision_gym


async def test_delete_custom_role_soft_deletes_and_list_excludes(client, platform_token):
    await provision_gym(client, platform_token, "roledelete")
    tokens = await login(client, "owner-roledelete@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    created = await client.post(
        "/api/v1/permissions/roles",
        headers=headers,
        json={"name": "Temp Role", "permission_codes": ["members.view"]},
    )
    assert created.status_code == 201, created.text
    role_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/v1/permissions/roles/{role_id}", headers=headers
    )
    assert deleted.status_code == 204, deleted.text

    listed = await client.get("/api/v1/permissions/roles", headers=headers)
    assert listed.status_code == 200
    assert role_id not in [r["id"] for r in listed.json()]

    again = await client.delete(f"/api/v1/permissions/roles/{role_id}", headers=headers)
    assert again.status_code == 404, again.text


async def test_delete_role_in_use_is_409_and_locked_is_422(client, platform_token):
    await provision_gym(client, platform_token, "roleinuse")
    tokens = await login(client, "owner-roleinuse@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    role = await client.post(
        "/api/v1/permissions/roles",
        headers=headers,
        json={"name": "Staff Role", "permission_codes": ["members.view"]},
    )
    assert role.status_code == 201, role.text
    role_id = role.json()["id"]

    emp = await client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "email": "staff-roleinuse@example.com",
            "full_name": "Staff",
            "password": "staff-pass-123",
            "role_ids": [role_id],
        },
    )
    assert emp.status_code == 201, emp.text

    in_use = await client.delete(f"/api/v1/permissions/roles/{role_id}", headers=headers)
    assert in_use.status_code == 409, in_use.text
    err = in_use.json()["error"]
    assert err["code"] == "ROLE_IN_USE"
    assert "1 user" in err["message"]

    # Locked seeded role (Gym Owner, is_editable=False) refuses deletion
    # before the usage check.
    listed = (await client.get("/api/v1/permissions/roles", headers=headers)).json()
    gym_owner = next(r for r in listed if r["name"] == "Gym Owner")
    assert gym_owner["is_editable"] is False
    locked = await client.delete(
        f"/api/v1/permissions/roles/{gym_owner['id']}", headers=headers
    )
    assert locked.status_code == 422, locked.text
    assert locked.json()["error"]["code"] == "ROLE_LOCKED"
