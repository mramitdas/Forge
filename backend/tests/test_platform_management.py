from __future__ import annotations

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
