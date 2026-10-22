from __future__ import annotations

from tests.helpers import login

_branch_counter = 0


async def _branch_id(client, token) -> str:
    # Unique per call: gym_a is session-scoped and codes are unique per gym.
    global _branch_counter
    _branch_counter += 1
    response = await client.post(
        "/api/v1/branches",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Test Branch", "code": f"ISO{_branch_counter}", "timezone": "Asia/Kolkata"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _create_plan(client, token: str, slug: str) -> dict:
    response = await client.post(
        "/api/v1/plans",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Iso Monthly",
            "slug": slug,
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_member(
    client, token, branch_id: str, plan_id: str, first_name: str
) -> dict:
    response = await client.post(
        "/api/v1/members",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "first_name": first_name,
            "last_name": "Member",
            "email": f"{first_name.lower()}@example.com",
            "phone": "+919900000001",
            "branch_id": branch_id,
            "plan_id": plan_id,
            "status": "inactive",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_tenant_cannot_read_other_tenant_member(client, gym_a, gym_b):
    owner_a = await login(client, "owner-gyma@example.com", "owner-pass-123")
    owner_b = await login(client, "owner-gymb@example.com", "owner-pass-123")
    branch_a = await _branch_id(client, owner_a["access_token"])
    plan_a = await _create_plan(client, owner_a["access_token"], "iso-plan-a")
    member = await _create_member(
        client, owner_a["access_token"], branch_a, plan_a["id"], "Alice"
    )

    # Owner B tries to fetch Alice's member record (belongs to tenant A).
    response = await client.get(
        f"/api/v1/members/{member['id']}",
        headers={"Authorization": f"Bearer {owner_b['access_token']}"},
    )
    assert response.status_code == 404

    # Owner B's member list contains nothing from tenant A.
    response = await client.get(
        "/api/v1/members",
        headers={"Authorization": f"Bearer {owner_b['access_token']}"},
    )
    assert response.status_code == 200
    assert response.json()["total"] == 0

    # Owner A can still read their own member.
    response = await client.get(
        f"/api/v1/members/{member['id']}",
        headers={"Authorization": f"Bearer {owner_a['access_token']}"},
    )
    assert response.status_code == 200


async def test_owner_b_cannot_touch_tenant_a_member(client, gym_a, gym_b):
    owner_a = await login(client, "owner-gyma@example.com", "owner-pass-123")
    owner_b = await login(client, "owner-gymb@example.com", "owner-pass-123")
    branch_a = await _branch_id(client, owner_a["access_token"])
    plan_a = await _create_plan(client, owner_a["access_token"], "iso-plan-b")
    member = await _create_member(
        client, owner_a["access_token"], branch_a, plan_a["id"], "Bob"
    )

    response = await client.patch(
        f"/api/v1/members/{member['id']}",
        headers={"Authorization": f"Bearer {owner_b['access_token']}"},
        json={"status": "active"},
    )
    assert response.status_code == 404

    response = await client.post(
        "/api/v1/checkin",
        headers={"Authorization": f"Bearer {owner_b['access_token']}"},
        json={"member_id": member["id"], "branch_id": branch_a, "source": "manual"},
    )
    assert response.status_code == 201
    assert response.json()["result"] == "denied"


async def test_platform_can_list_all_gyms(client, platform_token, gym_a, gym_b):
    response = await client.get(
        "/api/v1/platform/gyms",
        headers={"Authorization": f"Bearer {platform_token}"},
    )
    assert response.status_code == 200
    slugs = {g["slug"] for g in response.json()}
    assert {"gyma", "gymb"} <= slugs
