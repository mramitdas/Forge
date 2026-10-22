from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.attendance.models import CheckIn
from app.modules.members.models import Member
from sqlalchemy import update

from tests.helpers import login, provision_gym


async def _force_tie(model, gym_id: str, column: str) -> None:
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(gym_id)))
    try:
        async with maker() as session:
            await session.begin()
            await session.execute(update(model).values(**{column: datetime.now(UTC)}))
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)


async def test_members_pagination_stable_for_tied_created_at(client, platform_token):
    gym = await provision_gym(client, platform_token, "memtie")
    tokens = await login(client, "owner-memtie@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    branch = await client.post(
        "/api/v1/branches", headers=headers, json={"name": "Tie Branch"}
    )
    assert branch.status_code == 201, branch.text
    ids = []
    for i in range(3):
        res = await client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": f"Tie{i}",
                "last_name": "Maker",
                "email": f"tie{i}-memtie@example.com",
                "gender": "Male",
                "status": "inactive",
                "branch_id": branch.json()["id"],
            },
        )
        assert res.status_code == 201, res.text
        ids.append(res.json()["id"])
    await _force_tie(Member, gym["id"], "created_at")

    paged: list[str] = []
    for page in (1, 2):
        res = await client.get(
            "/api/v1/members", headers=headers, params={"page": page, "page_size": 2}
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] >= 3
        paged.extend(m["id"] for m in body["items"] if m["id"] in set(ids))
    assert paged == sorted(ids, reverse=True)


async def test_checkins_pagination_stable_for_tied_recorded_at(client, platform_token):
    gym = await provision_gym(client, platform_token, "checktie")
    tokens = await login(client, "owner-checktie@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    branch = await client.post(
        "/api/v1/branches", headers=headers, json={"name": "Check Branch"}
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members",
        headers=headers,
        json={
            "first_name": "Check",
            "last_name": "Tie",
            "email": "check-tie-checktie@example.com",
            "gender": "Male",
            "status": "active",
            "branch_id": branch.json()["id"],
        },
    )
    assert member.status_code == 201, member.text
    mid = member.json()["id"]
    ids = []
    for _ in range(3):
        res = await client.post(
            "/api/v1/checkin",
            headers=headers,
            json={"member_id": mid, "branch_id": branch.json()["id"]},
        )
        assert res.status_code in (200, 201), res.text
        ids.append(res.json()["id"])
    await _force_tie(CheckIn, gym["id"], "recorded_at")

    paged: list[str] = []
    for page in (1, 2):
        res = await client.get(
            "/api/v1/checkin",
            headers=headers,
            params={"page": page, "page_size": 2},
        )
        assert res.status_code == 200, res.text
        paged.extend(c["id"] for c in res.json()["items"] if c["id"] in set(ids))
    assert paged == sorted(ids, reverse=True)
