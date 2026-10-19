from __future__ import annotations

import uuid

from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.tenancy.models import Gym
from sqlalchemy import update

from tests.helpers import login, provision_gym


async def test_owner_sees_tier_with_usage(client, platform_token):
    gym = await provision_gym(client, platform_token, "tiersee")
    tokens = await login(client, "owner-tiersee@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    res = await client.get("/api/v1/subscriptions/tier", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tier_code"] == gym["tier_code"] == "starter"
    assert body["tier_name"] == "Starter"
    # Freshly provisioned gyms start with zero branches.
    assert body["branches_used"] == 0
    assert body["members_used"] == 0
    assert body["gym_status"] == "trial"

    branch = await client.post(
        "/api/v1/branches",
        headers=headers,
        json={"name": "Tier Branch"},
    )
    assert branch.status_code == 201, branch.text

    created = await client.post(
        "/api/v1/members",
        headers=headers,
        json={
            "first_name": "Tier",
            "last_name": "Member",
            "email": "tier-member-tiersee@example.com",
            "gender": "Male",
            "status": "lead",
            "branch_id": branch.json()["id"],
        },
    )
    assert created.status_code == 201, created.text
    res2 = await client.get("/api/v1/subscriptions/tier", headers=headers)
    usage = res2.json()
    assert usage["branches_used"] == 1
    assert usage["members_used"] == 1


async def test_staff_without_subscription_view_gets_403(client, platform_token):
    await provision_gym(client, platform_token, "tier403")
    owner = await login(client, "owner-tier403@example.com", "owner-pass-123")
    owner_headers = {"Authorization": f"Bearer {owner['access_token']}"}

    role = await client.post(
        "/api/v1/permissions/roles",
        headers=owner_headers,
        json={"name": "Viewers", "permission_codes": ["members.view"]},
    )
    assert role.status_code == 201, role.text
    emp = await client.post(
        "/api/v1/employees",
        headers=owner_headers,
        json={
            "email": "viewer-tier403@example.com",
            "full_name": "Viewer",
            "password": "viewer-pass-123",
            "role_ids": [role.json()["id"]],
        },
    )
    assert emp.status_code == 201, emp.text
    viewer = await login(client, "viewer-tier403@example.com", "viewer-pass-123")
    res = await client.get(
        "/api/v1/subscriptions/tier",
        headers={"Authorization": f"Bearer {viewer['access_token']}"},
    )
    assert res.status_code == 403, res.text


async def test_missing_tier_row_falls_back_to_code(client, platform_token):
    gym = await provision_gym(client, platform_token, "tierghost")
    tokens = await login(client, "owner-tierghost@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            await session.execute(
                update(Gym).where(Gym.slug == "tierghost").values(tier_code="ghost-tier")
            )
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)

    res = await client.get("/api/v1/subscriptions/tier", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tier_code"] == "ghost-tier"
    assert body["tier_name"] == "ghost-tier"
    assert body["price_minor"] is None
    assert body["max_branches"] is None
