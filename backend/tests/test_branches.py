from __future__ import annotations

from tests.helpers import login

_counter = 0
_branch_counter = 0


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_branch(client, token: str, name: str = "Main St", **overrides) -> dict:
    # Codes must be unique per gym — gym_a is session-scoped and every test
    # that calls this helper shares it, so derive the code from a counter.
    global _branch_counter
    _branch_counter += 1
    payload = {
        "name": name,
        "code": f"MS{_branch_counter}",
        "timezone": "Asia/Kolkata",
        "country_code": "+91",
    }
    payload.update(overrides)
    response = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json=payload,
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


def _error_code(response) -> str:
    body = response.json()
    return (body.get("error") or body.get("detail") or {}).get("code", "")


async def test_branch_duplicate_code_conflicts(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    await _create_branch(client, token, "Dup Code", code="DUPCODE")

    dupe = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={"name": "Another", "code": "DUPCODE", "timezone": "Asia/Kolkata"},
    )
    assert dupe.status_code == 409, dupe.text
    assert _error_code(dupe) == "CODE_TAKEN"

    case_variant = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={"name": "Case Variant", "code": "dupcode", "timezone": "Asia/Kolkata"},
    )
    assert case_variant.status_code == 409, case_variant.text
    assert _error_code(case_variant) == "CODE_TAKEN"


async def test_branch_update_duplicate_code_conflicts(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    first = await _create_branch(client, token, "First", code="FIRSTBR")
    second = await _create_branch(client, token, "Second", code="SECONDBR")

    steal = await client.patch(
        f"/api/v1/branches/{second['id']}",
        headers=_headers(token),
        json={"code": "FIRSTBR"},
    )
    assert steal.status_code == 409, steal.text
    assert _error_code(steal) == "CODE_TAKEN"

    keep_self = await client.patch(
        f"/api/v1/branches/{first['id']}",
        headers=_headers(token),
        json={"code": "firstbr"},
    )
    assert keep_self.status_code == 200, keep_self.text


async def test_branch_duplicate_phone_conflicts(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    await _create_branch(
        client, token, "Phone A", code="PHONA", phone="9876543210", country_code="+91"
    )

    same_number_variant = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": "Phone B",
            "code": "PHONB",
            "timezone": "Asia/Kolkata",
            "phone": "+91 98765 43210",
            "country_code": "+91",
        },
    )
    assert same_number_variant.status_code == 409, same_number_variant.text
    assert _error_code(same_number_variant) == "PHONE_TAKEN"


async def test_branch_duplicate_gst_scoped_per_gym(client, gym_a, gym_b):
    owner_a = await login(client, "owner-gyma@example.com", "owner-pass-123")
    owner_b = await login(client, "owner-gymb@example.com", "owner-pass-123")
    await _create_branch(
        client,
        owner_a["access_token"],
        "GST A",
        code="GSTA",
        gst_number="27ABCDE1234F1Z5",
    )

    lower_variant = await client.post(
        "/api/v1/branches",
        headers=_headers(owner_a["access_token"]),
        json={
            "name": "GST B",
            "code": "GSTB",
            "timezone": "Asia/Kolkata",
            "gst_number": "27abcde1234f1z5",
        },
    )
    assert lower_variant.status_code == 409, lower_variant.text
    assert _error_code(lower_variant) == "GST_TAKEN"

    other_gym = await client.post(
        "/api/v1/branches",
        headers=_headers(owner_b["access_token"]),
        json={
            "name": "GST Cross",
            "code": "GSTX",
            "timezone": "Asia/Kolkata",
            "gst_number": "27ABCDE1234F1Z5",
        },
    )
    assert other_gym.status_code == 201, other_gym.text


async def test_branch_invalid_phone_and_gst_rejected(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]

    bad_phone = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": "Bad Phone",
            "code": "BADPH",
            "timezone": "Asia/Kolkata",
            "phone": "12ab",
        },
    )
    assert bad_phone.status_code == 422, bad_phone.text

    short_phone = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": "Short Phone",
            "code": "SHORTPH",
            "timezone": "Asia/Kolkata",
            "phone": "12345",
        },
    )
    assert short_phone.status_code == 422, short_phone.text

    bad_gst = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": "Bad GST",
            "code": "BADGST",
            "timezone": "Asia/Kolkata",
            "gst_number": "not-a-gstin",
        },
    )
    assert bad_gst.status_code == 422, bad_gst.text

    good_gst = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": "Lower GST",
            "code": "LOWGST",
            "timezone": "Asia/Kolkata",
            "gst_number": " 29aaaca1234a1z9 ",
        },
    )
    assert good_gst.status_code == 201, good_gst.text
    assert good_gst.json()["gst_number"] == "29AAACA1234A1Z9"


async def test_disabled_branch_rejects_detail_updates(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token, "Disable Me")

    disabled = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200, disabled.text

    rename = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"name": "Sneaky Rename"},
    )
    assert rename.status_code == 409, rename.text
    assert _error_code(rename) == "BRANCH_DISABLED"

    rephone = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"phone": "9111122222"},
    )
    assert rephone.status_code == 409, rephone.text
    assert _error_code(rephone) == "BRANCH_DISABLED"

    enabled = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"is_active": True},
    )
    assert enabled.status_code == 200, enabled.text

    renamed = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"name": "Now Editable"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Now Editable"


async def test_branch_code_unique_per_gym_not_global(client, gym_a, gym_b):
    owner_a = await login(client, "owner-gyma@example.com", "owner-pass-123")
    owner_b = await login(client, "owner-gymb@example.com", "owner-pass-123")
    await _create_branch(client, owner_a["access_token"], "Gym A SHARED", code="SHARED")

    other_gym_same_code = await client.post(
        "/api/v1/branches",
        headers=_headers(owner_b["access_token"]),
        json={"name": "Gym B SHARED", "code": "SHARED", "timezone": "Asia/Kolkata"},
    )
    assert other_gym_same_code.status_code == 201, other_gym_same_code.text
