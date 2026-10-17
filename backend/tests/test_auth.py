from __future__ import annotations

from tests.helpers import login


async def test_login_and_me(client, gym_a):
    tokens = await login(client, "owner-gyma@example.com", "owner-pass-123")
    assert tokens["access_token"]
    assert tokens["refresh_token"]
    assert tokens["token_type"] == "bearer"

    response = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert response.status_code == 200
    me = response.json()
    assert str(me["tenant_id"]) == str(gym_a["id"])
    assert me["is_platform"] is False
    assert "members.create" in me["permissions"]
    assert "billing.payments.capture" in me["permissions"]
    assert me["branches"] == []


async def test_refresh_rotation_revokes_reuse(client, gym_a):
    tokens = await login(client, "owner-gyma@example.com", "owner-pass-123")
    first = tokens["refresh_token"]

    # First rotation succeeds and issues a new token in the same family.
    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first}
    )
    assert response.status_code == 200
    second = response.json()["refresh_token"]
    assert second != first

    # Reusing the rotated-out token revokes the whole family.
    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first}
    )
    assert response.status_code == 401

    # The newly issued token is now dead too (family revoked).
    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": second}
    )
    assert response.status_code == 401


async def test_invalid_credentials(client, gym_a):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-gyma@example.com", "password": "wrong-pass-123"},
    )
    assert response.status_code == 401


async def test_logout_revokes_refresh(client, gym_a):
    tokens = await login(client, "owner-gyma@example.com", "owner-pass-123")
    response = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 204
    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 401


async def test_permission_catalog_and_roles(client, gym_a):
    tokens = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = await client.get("/api/v1/permissions", headers=headers)
    assert response.status_code == 200
    codes = {p["code"] for p in response.json()}
    assert len(codes) >= 25
    assert {"members.create", "attendance.checkin", "roles.manage"} <= codes

    response = await client.get("/api/v1/permissions/roles", headers=headers)
    assert response.status_code == 200
    roles = response.json()
    names = {r["name"] for r in roles}
    assert "Gym Owner" in names

    response = await client.post(
        "/api/v1/permissions/roles",
        headers=headers,
        json={
            "name": "Front Desk",
            "description": "Reception staff",
            "permission_codes": ["members.view", "attendance.checkin"],
            "branch_scope": "all",
        },
    )
    assert response.status_code == 201
    role = response.json()
    assert role["name"] == "Front Desk"

    # Unknown permission codes are rejected.
    response = await client.post(
        "/api/v1/permissions/roles",
        headers=headers,
        json={
            "name": "Bad Role",
            "permission_codes": ["not.a.real.perm"],
            "branch_scope": "all",
        },
    )
    assert response.status_code == 422


async def test_update_me_profile(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original_name = before.json()["user"]["full_name"]

    response = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": "Renamed Owner"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["full_name"] == "Renamed Owner"

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["user"]["full_name"] == "Renamed Owner"

    # Email belonging to another user → 409.
    emp = await client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "email": "taken-me-profile@example.com",
            "full_name": "Temp Employee",
            "password": "temp-pass-123",
        },
    )
    assert emp.status_code == 201, emp.text
    conflict = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": "taken-me-profile@example.com"}
    )
    assert conflict.status_code == 409, conflict.text

    # Restoring the original name keeps the suite state clean for gym_a.
    restore = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": original_name}
    )
    assert restore.status_code == 200, restore.text


async def test_update_me_email_conflict_other_tenant(client, gym_a, gym_b):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original_email = before.json()["user"]["email"]

    # owner-gymb@example.com belongs to a DIFFERENT tenant — the per-tenant
    # unique index cannot catch it, and login matches email globally.
    response = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": "owner-gymb@example.com"}
    )
    if response.status_code != 409:
        # Regression guard: undo the cross-tenant email so the rest of the
        # suite can still log in as owner-gyma@example.com.
        await client.patch(
            "/api/v1/auth/me", headers=headers, json={"email": original_email}
        )
    assert response.status_code == 409, response.text


async def test_update_me_email_change_lowercased(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original_email = before.json()["user"]["email"]

    response = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"email": "Mixed.Case.Me@Test.COM"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["email"] == "mixed.case.me@test.com"

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["user"]["email"] == "mixed.case.me@test.com"

    restore = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": original_email}
    )
    assert restore.status_code == 200, restore.text
    restored = await client.get("/api/v1/auth/me", headers=headers)
    assert restored.json()["user"]["email"] == original_email


async def test_db_rejects_duplicate_active_email_across_tenants(gym_a, gym_b):
    """The service probe narrows cross-tenant claims, but the database is
    the backstop for probe/insert races — exercise the index directly."""
    import uuid as _uuid

    import pytest
    from app.core.tenant import (
        TenantContext,
        reset_tenant_context,
        set_tenant_context,
    )
    from app.db.session import get_sessionmaker
    from app.modules.identity.models import User
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    # Raw sessions run under FORCE RLS; read both tenants from platform scope
    # (same idiom as conftest._make_user).
    ctx_token = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    try:
        Session = get_sessionmaker()
        async with Session() as session:
            await session.begin()
            owner_a = await session.scalar(
                select(User).where(User.email == "owner-gyma@example.com")
            )
            assert owner_a is not None
            session.add(
                User(
                    tenant_id=_uuid.UUID(str(gym_b["id"])),
                    email=owner_a.email,
                    full_name="Cross-Tenant Dupe",
                )
            )
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()
    finally:
        reset_tenant_context(ctx_token)


async def test_update_me_validation_errors(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original_name = before.json()["user"]["full_name"]

    bad_email = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": "not-an-email"}
    )
    assert bad_email.status_code == 422, bad_email.text

    short = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": "a"}
    )
    assert short.status_code == 422, short.text

    # min_length must apply AFTER stripping: " a " (3 raw chars) must not
    # slip through as a 1-char name.
    padded_short = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": " a "}
    )
    if padded_short.status_code == 200:
        await client.patch(
            "/api/v1/auth/me", headers=headers, json={"full_name": original_name}
        )
    assert padded_short.status_code == 422, padded_short.text
