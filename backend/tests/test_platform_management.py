from __future__ import annotations

import uuid
from datetime import UTC, datetime
from itertools import pairwise

from tests.helpers import login, provision_gym


async def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _owner_id(client, token, email: str) -> str:
    response = await client.get(
        "/api/v1/platform/owners", headers=await _headers(token)
    )
    assert response.status_code == 200, response.text
    for owner in response.json():
        if owner["email"] == email:
            return owner["id"]
    raise AssertionError(f"owner {email} not found")


async def test_list_tiers(client, platform_token):
    response = await client.get(
        "/api/v1/platform/tiers", headers=await _headers(platform_token)
    )
    assert response.status_code == 200, response.text
    codes = {t["code"] for t in response.json()}
    assert {"starter", "pro", "enterprise"} <= codes


async def test_update_gym_profile(client, platform_token):
    gym = await provision_gym(client, platform_token, "updgym")
    response = await client.patch(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers=await _headers(platform_token),
        json={"name": "Upgraded Gym", "timezone": "Europe/London", "currency": "GBP"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Upgraded Gym"
    assert body["timezone"] == "Europe/London"
    assert body["currency"] == "GBP"


async def test_update_gym_rejects_overlong_timezone(client, platform_token):
    gym = await provision_gym(client, platform_token, "tztoo")
    response = await client.patch(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers=await _headers(platform_token),
        json={"timezone": "x" * 65},
    )
    assert response.status_code == 422, response.text


async def test_delete_gym_removes_from_registry_and_blocks_login(
    client, platform_token
):
    gym = await provision_gym(client, platform_token, "delgym")
    response = await client.delete(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers=await _headers(platform_token),
    )
    assert response.status_code == 204

    listing = await client.get(
        "/api/v1/platform/gyms", headers=await _headers(platform_token)
    )
    assert all(g["slug"] != "delgym" for g in listing.json())

    # The owner account is soft-deleted, so credentials no longer work.
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-delgym@example.com", "password": "owner-pass-123"},
    )
    assert response.status_code == 401

    # Deleting again is a 404.
    response = await client.delete(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers=await _headers(platform_token),
    )
    assert response.status_code == 404


async def test_update_owner_profile_and_password(client, platform_token):
    await provision_gym(client, platform_token, "owneredit")
    owner_id = await _owner_id(client, platform_token, "owner-owneredit@example.com")

    response = await client.patch(
        f"/api/v1/platform/owners/{owner_id}",
        headers=await _headers(platform_token),
        json={
            "full_name": "Renamed Owner",
            "email": "renamed-owner@example.com",
            "password": "new-owner-pass-123",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Renamed Owner"

    # Old credentials fail, new ones work.
    old = await client.post(
        "/api/v1/auth/login",
        json={"email": "renamed-owner@example.com", "password": "owner-pass-123"},
    )
    assert old.status_code == 401
    fresh = await client.post(
        "/api/v1/auth/login",
        json={"email": "renamed-owner@example.com", "password": "new-owner-pass-123"},
    )
    assert fresh.status_code == 200


async def test_disable_and_reenable_owner(client, platform_token):
    await provision_gym(client, platform_token, "ownertoggle")
    owner_id = await _owner_id(client, platform_token, "owner-ownertoggle@example.com")

    response = await client.patch(
        f"/api/v1/platform/owners/{owner_id}",
        headers=await _headers(platform_token),
        json={"is_active": False},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    denied = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-ownertoggle@example.com", "password": "owner-pass-123"},
    )
    assert denied.status_code == 401

    response = await client.patch(
        f"/api/v1/platform/owners/{owner_id}",
        headers=await _headers(platform_token),
        json={"is_active": True},
    )
    assert response.status_code == 200
    allowed = await login(client, "owner-ownertoggle@example.com", "owner-pass-123")
    assert allowed["access_token"]


async def test_impersonate_owner_opens_gym_session(client, platform_token):
    await provision_gym(client, platform_token, "impgym")
    owner_id = await _owner_id(client, platform_token, "owner-impgym@example.com")

    response = await client.post(
        f"/api/v1/platform/owners/{owner_id}/impersonate",
        headers=await _headers(platform_token),
    )
    assert response.status_code == 200, response.text
    tokens = response.json()
    assert tokens["access_token"]

    me = await client.get(
        "/api/v1/auth/me", headers=await _headers(tokens["access_token"])
    )
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["is_platform"] is False
    assert body["tenant_name"] == "Gym impgym"
    assert "members.create" in body["permissions"]

    # A freshly provisioned gym has no branches; the owner creates them.
    branches = await client.get(
        "/api/v1/branches", headers=await _headers(tokens["access_token"])
    )
    assert branches.status_code == 200
    assert branches.json() == []


async def test_change_gym_tier(client, platform_token):
    gym = await provision_gym(client, platform_token, "tiergym")
    assert gym["tier_code"] == "starter"

    response = await client.patch(
        f"/api/v1/platform/subscriptions/{gym['id']}",
        headers=await _headers(platform_token),
        json={"tier_code": "pro"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["tier_code"] == "pro"
    assert response.json()["tier_name"] == "Pro"

    listing = await client.get(
        "/api/v1/platform/subscriptions", headers=await _headers(platform_token)
    )
    assert listing.status_code == 200
    row = next(s for s in listing.json() if s["gym_id"] == gym["id"])
    assert row["tier_code"] == "pro"

    unknown = await client.patch(
        f"/api/v1/platform/subscriptions/{gym['id']}",
        headers=await _headers(platform_token),
        json={"tier_code": "platinum"},
    )
    assert unknown.status_code == 409


async def test_tier_crud(client, platform_token):
    created = await client.post(
        "/api/v1/platform/tiers",
        headers=await _headers(platform_token),
        json={
            "code": "boutique",
            "name": "Boutique",
            "description": "A premium single-branch plan.",
            "max_branches": 1,
            "max_members": 500,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["is_active"] is True

    duplicate = await client.post(
        "/api/v1/platform/tiers",
        headers=await _headers(platform_token),
        json={"code": "boutique", "name": "Boutique again"},
    )
    assert duplicate.status_code == 409

    updated = await client.patch(
        "/api/v1/platform/tiers/boutique",
        headers=await _headers(platform_token),
        json={"name": "Boutique Plus", "description": "Updated description.", "is_active": False},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["name"] == "Boutique Plus"
    assert body["is_active"] is False

    listing = await client.get(
        "/api/v1/platform/tiers", headers=await _headers(platform_token)
    )
    codes = {t["code"]: t for t in listing.json()}
    assert codes["boutique"]["is_active"] is False

    deleted = await client.delete(
        "/api/v1/platform/tiers/boutique", headers=await _headers(platform_token)
    )
    assert deleted.status_code == 204
    missing = await client.delete(
        "/api/v1/platform/tiers/boutique", headers=await _headers(platform_token)
    )
    assert missing.status_code == 404


async def test_tier_in_use_cannot_be_deleted(client, platform_token):
    response = await client.delete(
        "/api/v1/platform/tiers/starter", headers=await _headers(platform_token)
    )
    assert response.status_code == 409


async def test_disabled_tier_blocks_assignment(client, platform_token, gym_b):
    disabled = await client.patch(
        "/api/v1/platform/tiers/pro",
        headers=await _headers(platform_token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200

    provision = await client.post(
        "/api/v1/platform/gyms",
        headers=await _headers(platform_token),
        json={
            "name": "Disabled Tier Gym",
            "slug": "dis-tier-gym",
            "owner_email": "owner-dis-tier@gym-erp.dev",
            "owner_name": "Owner",
            "owner_password": "owner-pass-123",
            "tier_code": "pro",
        },
    )
    assert provision.status_code == 409

    change = await client.patch(
        f"/api/v1/platform/subscriptions/{gym_b['id']}",
        headers=await _headers(platform_token),
        json={"tier_code": "pro"},
    )
    assert change.status_code == 409

    reenabled = await client.patch(
        "/api/v1/platform/tiers/pro",
        headers=await _headers(platform_token),
        json={"is_active": True},
    )
    assert reenabled.status_code == 200


async def test_subscription_events_recorded(client, platform_token):
    gym = await provision_gym(client, platform_token, "eventgym")
    events = await client.get(
        "/api/v1/platform/subscription-events", headers=await _headers(platform_token)
    )
    assert events.status_code == 200
    names = {e["gym_name"] for e in events.json()}
    assert "Gym eventgym" in names

    changed = await client.patch(
        f"/api/v1/platform/subscriptions/{gym['id']}",
        headers=await _headers(platform_token),
        json={"tier_code": "pro"},
    )
    assert changed.status_code == 200

    events = await client.get(
        "/api/v1/platform/subscription-events", headers=await _headers(platform_token)
    )
    rows = [e for e in events.json() if e["gym_name"] == "Gym eventgym"]
    assert any(e["event_type"] == "provisioned" and e["to_tier_code"] == "starter" for e in rows)
    changed_rows = [e for e in rows if e["event_type"] == "tier_changed"]
    assert len(changed_rows) == 1
    assert changed_rows[0]["from_tier_code"] == "starter"
    assert changed_rows[0]["to_tier_code"] == "pro"
    assert changed_rows[0]["actor_email"] == "platform@example.com"


async def test_platform_revenue_shape(client, platform_token):
    response = await client.get(
        "/api/v1/platform/revenue", headers=await _headers(platform_token)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["series"]) == 12
    assert isinstance(body["sold"], list)
    assert isinstance(body["total_minor"], int)


async def test_revenue_series_months_are_consecutive(client, platform_token):
    """The 12-month axis must be 12 consecutive calendar months ending now."""
    response = await client.get(
        "/api/v1/platform/revenue", headers=await _headers(platform_token)
    )
    assert response.status_code == 200, response.text
    months = [p["month"] for p in response.json()["series"]]

    assert len(set(months)) == 12, f"duplicate months in {months}"
    assert months[-1] == datetime.now(UTC).strftime("%Y-%m"), months
    parsed = [(int(m[:4]), int(m[5:7])) for m in months]
    for (y1, m1), (y2, m2) in pairwise(parsed):
        assert (y2 * 12 + m2) - (y1 * 12 + m1) == 1, f"gap in {months}"


async def test_gym_subscription_counts_exclude_soft_deleted(client, platform_token):
    """Members/subscriptions counts must ignore soft-deleted rows."""
    gym = await provision_gym(client, platform_token, "countgym")
    owner = await login(client, "owner-countgym@example.com", "owner-pass-123")
    owner_headers = {"Authorization": f"Bearer {owner['access_token']}"}

    async def counts() -> tuple[int, int]:
        listing = await client.get(
            "/api/v1/platform/subscriptions", headers=await _headers(platform_token)
        )
        assert listing.status_code == 200, listing.text
        row = next(g for g in listing.json() if g["gym_id"] == gym["id"])
        return row["members_count"], row["active_subscriptions"]

    assert await counts() == (0, 0)

    branch = await client.post(
        "/api/v1/branches",
        headers=owner_headers,
        json={
            "name": "Main",
            "code": "CM",
            "timezone": "Asia/Kolkata",
            "country_code": "+91",
        },
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members",
        headers=owner_headers,
        json={
            "first_name": "Count",
            "last_name": "Test",
            "email": "count-test@example.com",
            "phone": "9000000000",
            "country_code": "+91",
            "branch_id": branch.json()["id"],
            "status": "active",
        },
    )
    assert member.status_code == 201, member.text
    plan = await client.post(
        "/api/v1/plans",
        headers=owner_headers,
        json={
            "name": "Count Monthly",
            "slug": "count-monthly",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    sub = await client.post(
        "/api/v1/plans/subscribe",
        headers=owner_headers,
        json={
            "member_id": member.json()["id"],
            "plan_id": plan.json()["id"],
            "branch_id": branch.json()["id"],
        },
    )
    assert sub.status_code == 201, sub.text
    activated = await client.post(
        f"/api/v1/plans/subscriptions/{sub.json()['id']}/activate",
        headers=owner_headers,
    )
    assert activated.status_code == 200, activated.text
    assert await counts() == (1, 1)

    deleted = await client.delete(
        f"/api/v1/members/{member.json()['id']}", headers=owner_headers
    )
    assert deleted.status_code == 204, deleted.text
    assert await counts() == (0, 0)


async def test_delete_gym_cascades_members(client, platform_token):
    """Gym delete must tombstone members, not just users + branches."""
    gym = await provision_gym(client, platform_token, "delcasc")
    owner = await login(client, "owner-delcasc@example.com", "owner-pass-123")
    oh = {"Authorization": f"Bearer {owner['access_token']}"}

    branch = await client.post(
        "/api/v1/branches",
        headers=oh,
        json={"name": "Main", "code": "DC", "timezone": "Asia/Kolkata", "country_code": "+91"},
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members",
        headers=oh,
        json={
            "first_name": "Casc", "last_name": "Member",
            "email": "casc-member@example.com", "phone": "9000000000",
            "country_code": "+91", "branch_id": branch.json()["id"], "status": "active",
        },
    )
    assert member.status_code == 201, member.text

    deleted = await client.delete(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers={"Authorization": f"Bearer {platform_token}"},
    )
    assert deleted.status_code == 204

    # The member row must be soft-deleted. Verify via direct DB read (the
    # member list endpoint scopes through the gym, so it would hide the row
    # either way). The read is tenant-scoped, so stamp the gym's tenant
    # context first.
    import uuid as _uuid

    from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
    from app.db.session import get_sessionmaker
    from app.modules.members.models import Member

    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=_uuid.UUID(str(gym["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            row = await session.get(Member, member.json()["id"])
            assert row is not None
            assert row.deleted_at is not None
    finally:
        reset_tenant_context(token_ctx)


async def test_delete_tier_allowed_when_only_deleted_gym_references(client, platform_token):
    """Only soft-deleted gyms referencing a tier must NOT block its deletion."""
    created = await client.post(
        "/api/v1/platform/tiers",
        headers=await _headers(platform_token),
        json={"code": "ghost", "name": "Ghost", "max_branches": 1, "max_members": 10},
    )
    assert created.status_code == 201, created.text

    gym = await provision_gym(client, platform_token, "ghostgym")
    changed = await client.patch(
        f"/api/v1/platform/subscriptions/{gym['id']}",
        headers=await _headers(platform_token),
        json={"tier_code": "ghost"},
    )
    assert changed.status_code == 200, changed.text

    deleted_gym = await client.delete(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers=await _headers(platform_token),
    )
    assert deleted_gym.status_code == 204

    # The tombstoned gym still references 'ghost', but a deleted gym does
    # not pin the tier — deletion succeeds without any re-pointing.
    allowed = await client.delete(
        "/api/v1/platform/tiers/ghost", headers=await _headers(platform_token)
    )
    assert allowed.status_code == 204, allowed.text


async def test_list_gyms_include_deleted_flag(client, platform_token):
    """Default list hides deleted gyms; include_deleted=true shows them."""
    gym = await provision_gym(client, platform_token, "listdel")
    headers = await _headers(platform_token)

    deleted = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted.status_code == 204

    default = await client.get("/api/v1/platform/gyms", headers=headers)
    assert default.status_code == 200
    assert all(g["slug"] != "listdel" for g in default.json())

    with_deleted = await client.get(
        "/api/v1/platform/gyms?include_deleted=true", headers=headers
    )
    assert with_deleted.status_code == 200
    row = next(g for g in with_deleted.json() if g["slug"] == "listdel")
    assert row["deleted_at"] is not None


async def test_gym_out_live_gym_has_null_deleted_at(client, platform_token):
    """A live gym still serializes deleted_at=None (response shape unchanged)."""
    await provision_gym(client, platform_token, "livedel")
    headers = await _headers(platform_token)
    listing = await client.get("/api/v1/platform/gyms", headers=headers)
    row = next(g for g in listing.json() if g["slug"] == "livedel")
    assert row["deleted_at"] is None


async def test_restore_gym_full_cascade(client, platform_token):
    """Restore un-tombstones the gym + users + branches + members."""
    gym = await provision_gym(client, platform_token, "restgym")
    owner = await login(client, "owner-restgym@example.com", "owner-pass-123")
    oh = {"Authorization": f"Bearer {owner['access_token']}"}
    headers = {"Authorization": f"Bearer {platform_token}"}

    branch = await client.post(
        "/api/v1/branches", headers=oh,
        json={"name": "Main", "code": "RG", "timezone": "Asia/Kolkata", "country_code": "+91"},
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members", headers=oh,
        json={
            "first_name": "Rest", "last_name": "Member",
            "email": "rest-member@example.com", "phone": "9000000000",
            "country_code": "+91", "branch_id": branch.json()["id"], "status": "active",
        },
    )
    assert member.status_code == 201, member.text

    deleted = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted.status_code == 204

    restored = await client.post(
        f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["deleted_at"] is None

    # Owner can log in again (user un-tombstoned).
    allowed = await login(client, "owner-restgym@example.com", "owner-pass-123")
    assert allowed["access_token"]

    # Member is alive again. The read is tenant-scoped, so stamp the gym's
    # tenant context first.
    from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
    from app.db.session import get_sessionmaker
    from app.modules.members.models import Member

    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            row = await session.get(Member, member.json()["id"])
            assert row.deleted_at is None
    finally:
        reset_tenant_context(token_ctx)


async def test_restore_gym_later_deleted_member_stays_deleted(client, platform_token):
    """A member deleted AFTER the gym delete (different timestamp) stays deleted."""
    gym = await provision_gym(client, platform_token, "restdiff")
    owner = await login(client, "owner-restdiff@example.com", "owner-pass-123")
    oh = {"Authorization": f"Bearer {owner['access_token']}"}
    headers = {"Authorization": f"Bearer {platform_token}"}

    branch = await client.post(
        "/api/v1/branches", headers=oh,
        json={"name": "Main", "code": "RD", "timezone": "Asia/Kolkata", "country_code": "+91"},
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members", headers=oh,
        json={
            "first_name": "Diff", "last_name": "Member",
            "email": "diff-member@example.com", "phone": "9000000001",
            "country_code": "+91", "branch_id": branch.json()["id"], "status": "active",
        },
    )
    assert member.status_code == 201, member.text

    deleted = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted.status_code == 204

    # Soft-delete the member independently (simulates a later manual delete).
    # This happens after the gym delete, so its deleted_at differs from the
    # gym's cascade timestamp.
    from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
    from app.db.session import get_sessionmaker
    from app.modules.members.models import Member

    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            row = await session.get(Member, member.json()["id"])
            row.deleted_at = datetime.now(UTC)
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)

    restored = await client.post(
        f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers
    )
    assert restored.status_code == 200, restored.text

    token_ctx2 = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            row = await session.get(Member, member.json()["id"])
            assert row.deleted_at is not None  # the later delete is preserved
    finally:
        reset_tenant_context(token_ctx2)


async def test_restore_gym_errors(client, platform_token):
    """Restore: 404 missing gym, 409 live gym, 409 disabled tier."""
    headers = {"Authorization": f"Bearer {platform_token}"}

    missing = await client.post(
        "/api/v1/platform/gyms/00000000-0000-0000-0000-000000000000/restore", headers=headers
    )
    assert missing.status_code == 404

    gym = await provision_gym(client, platform_token, "restlive")
    live = await client.post(f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers)
    assert live.status_code == 409
    assert live.json()["error"]["code"] == "GYM_NOT_DELETED"

    # Disable the gym's tier, then delete + restore the gym -> 409 TIER_DISABLED.
    disabled = await client.patch(
        "/api/v1/platform/tiers/starter",
        headers=headers,
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    deleted = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted.status_code == 204
    blocked = await client.post(f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "TIER_DISABLED"
    # Re-enable for other tests.
    reenabled = await client.patch(
        "/api/v1/platform/tiers/starter",
        headers=headers,
        json={"is_active": True},
    )
    assert reenabled.status_code == 200


async def test_restore_gym_with_tier_code_attaches_active_tier(client, platform_token):
    """Restore with {tier_code} re-attaches a new tier when the old one is gone."""
    headers = {"Authorization": f"Bearer {platform_token}"}

    created = await client.post(
        "/api/v1/platform/tiers",
        headers=headers,
        json={"code": "reclaim", "name": "Reclaim", "max_branches": 2, "max_members": 50},
    )
    assert created.status_code == 201, created.text

    gym = await provision_gym(client, platform_token, "reclaimgym")
    changed = await client.patch(
        f"/api/v1/platform/subscriptions/{gym['id']}",
        headers=headers,
        json={"tier_code": "reclaim"},
    )
    assert changed.status_code == 200, changed.text

    deleted_gym = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted_gym.status_code == 204

    # The gym's tier is deleted while it is tombstoned.
    deleted_tier = await client.delete("/api/v1/platform/tiers/reclaim", headers=headers)
    assert deleted_tier.status_code == 204, deleted_tier.text

    # No body -> the dangling tier is still reported, gym stays deleted.
    blocked = await client.post(f"/api/v1/platform/gyms/{gym['id']}/restore", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "TIER_MISSING"

    # With {tier_code} -> gym comes back on the supplied active tier.
    restored = await client.post(
        f"/api/v1/platform/gyms/{gym['id']}/restore",
        headers=headers,
        json={"tier_code": "starter"},
    )
    assert restored.status_code == 200, restored.text
    body = restored.json()
    assert body["deleted_at"] is None
    assert body["tier_code"] == "starter"

    # The attach is audited through the normal tier-change event path.
    events = await client.get("/api/v1/platform/subscription-events", headers=headers)
    assert events.status_code == 200
    attach = next(
        e for e in events.json()
        if e["gym_id"] == gym["id"] and e["to_tier_code"] == "starter"
    )
    assert attach["from_tier_code"] == "reclaim"
    assert attach["event_type"] == "tier_changed"

    # Gym is visible in the live list again.
    listing = await client.get("/api/v1/platform/gyms", headers=headers)
    assert any(g["id"] == gym["id"] for g in listing.json())


async def test_restore_gym_invalid_tier_code_leaves_gym_deleted(client, platform_token):
    """A rejected {tier_code} never leaves a half-restored gym."""
    headers = {"Authorization": f"Bearer {platform_token}"}

    gym = await provision_gym(client, platform_token, "badattach")
    deleted = await client.delete(f"/api/v1/platform/gyms/{gym['id']}", headers=headers)
    assert deleted.status_code == 204

    unknown = await client.post(
        f"/api/v1/platform/gyms/{gym['id']}/restore",
        headers=headers,
        json={"tier_code": "no-such-tier"},
    )
    assert unknown.status_code == 409
    assert unknown.json()["error"]["code"] == "UNKNOWN_TIER"

    created = await client.post(
        "/api/v1/platform/tiers",
        headers=headers,
        json={"code": "disatt", "name": "Dis Attach"},
    )
    assert created.status_code == 201, created.text
    disabled = await client.patch(
        "/api/v1/platform/tiers/disatt",
        headers=headers,
        json={"is_active": False},
    )
    assert disabled.status_code == 200

    inactive = await client.post(
        f"/api/v1/platform/gyms/{gym['id']}/restore",
        headers=headers,
        json={"tier_code": "disatt"},
    )
    assert inactive.status_code == 409
    assert inactive.json()["error"]["code"] == "TIER_DISABLED"

    # Both rejections left the gym fully deleted (no partial restore).
    listing = await client.get(
        "/api/v1/platform/gyms?include_deleted=true", headers=headers
    )
    row = next(g for g in listing.json() if g["id"] == gym["id"])
    assert row["deleted_at"] is not None
