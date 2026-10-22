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
        json={
            "name": "Search Branch",
            "code": f"SRCH{_branch_counter}",
            "timezone": "Asia/Kolkata",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_search_matches_full_name(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _branch_id(client, token)
    plan = await client.post(
        "/api/v1/plans",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Search Monthly",
            "slug": "search-monthly",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    created = await client.post(
        "/api/v1/members",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "first_name": "DblClick",
            "last_name": "QA",
            "email": "dblclick-qa@example.com",
            "phone": "+919900000011",
            "branch_id": branch,
            "plan_id": plan.json()["id"],
        },
    )
    assert created.status_code == 201, created.text
    member_id = created.json()["id"]

    other = await client.post(
        "/api/v1/members",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "first_name": "Sole",
            "last_name": "Name",
            "email": "sole-name@example.com",
            "phone": "+919900000012",
            "branch_id": branch,
            "plan_id": plan.json()["id"],
        },
    )
    assert other.status_code == 201, other.text
    other_id = other.json()["id"]

    for query in ("DblClick QA", "DblClick", "QA"):
        response = await client.get(
            "/api/v1/members",
            params={"search": query},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        ids = [m["id"] for m in response.json()["items"]]
        assert member_id in ids, f"search={query!r} missed member: {ids}"
        assert other_id not in ids, f"search={query!r} leaked non-matching member: {ids}"
