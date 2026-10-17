from __future__ import annotations

from tests.helpers import login

_counter = 0


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_branch(client, token: str, name: str = "Main St") -> dict:
    response = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": name,
            "code": "MS",
            "timezone": "Asia/Kolkata",
            "country_code": "+91",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_member(client, token: str, branch_id: str) -> dict:
    global _counter
    _counter += 1
    response = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": "Ada",
            "last_name": "Lovelace",
            "email": f"ada-branch-{_counter}@example.com",
            "phone": f"+9199000000{_counter:02d}",
            "branch_id": branch_id,
            "status": "active",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_branch_crud(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]

    branch = await _create_branch(client, token)
    assert branch["is_active"] is True
    assert branch["country_code"] == "+91"

    updated = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"name": "Main Street", "country_code": "+971"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Main Street"
    assert updated.json()["country_code"] == "+971"

    listed = await client.get("/api/v1/branches", headers=_headers(token))
    assert listed.status_code == 200
    assert {b["name"] for b in listed.json()} == {"Main Street"}


async def test_disable_branch_freezes_members(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    response = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_active"] is False

    me = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert me.status_code == 200
    assert me.json()["status"] == "frozen"

    checkin = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch["id"], "source": "manual"},
    )
    assert checkin.status_code == 201
    assert checkin.json()["result"] == "denied"


async def test_enable_branch_restores_frozen_members(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])
    assert member["status"] == "active"

    await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    me = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert me.json()["status"] == "frozen"

    enabled = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"is_active": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["is_active"] is True

    me = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert me.json()["status"] == "active"

    checkin = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch["id"], "source": "manual"},
    )
    assert checkin.status_code == 201
    assert checkin.json()["result"] == "denied"
    assert checkin.json()["reason"] == "no active membership"


async def test_enable_branch_keeps_individually_frozen_members(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    frozen = await client.patch(
        f"/api/v1/members/{member['id']}",
        headers=_headers(token),
        json={"status": "frozen"},
    )
    assert frozen.status_code == 200
    assert frozen.json()["status"] == "frozen"

    await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"is_active": True},
    )

    me = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert me.json()["status"] == "frozen"


async def test_delete_branch_soft_deletes_members(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    response = await client.delete(
        f"/api/v1/branches/{branch['id']}", headers=_headers(token)
    )
    assert response.status_code == 204, response.text

    listed = await client.get("/api/v1/branches", headers=_headers(token))
    assert listed.status_code == 200
    assert branch["id"] not in {b["id"] for b in listed.json()}

    me = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert me.status_code == 404


async def test_branch_update_rejects_overlong_timezone(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token, "TZ Bound St")
    response = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"timezone": "x" * 65},
    )
    assert response.status_code == 422, response.text


async def test_branch_is_tenant_scoped(client, gym_a, gym_b):
    owner_a = await login(client, "owner-gyma@example.com", "owner-pass-123")
    owner_b = await login(client, "owner-gymb@example.com", "owner-pass-123")
    branch = await _create_branch(client, owner_a["access_token"])

    patch = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(owner_b["access_token"]),
        json={"name": "Hijack"},
    )
    assert patch.status_code == 404

    delete = await client.delete(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(owner_b["access_token"]),
    )
    assert delete.status_code == 404
