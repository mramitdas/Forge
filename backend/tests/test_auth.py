from __future__ import annotations

import pytest
from app.core.security import hash_password
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.identity.models import Credential, User
from sqlalchemy import select

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
    assert "members.manage" in me["permissions"]
    assert "billing.manage" in me["permissions"]
    assert me["branches"] == []


async def test_me_role_and_branch_timezones(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    branch = await client.post(
        "/api/v1/branches",
        headers=headers,
        json={"name": "Me TZ Branch", "code": "MT", "timezone": "Europe/Berlin"},
    )
    assert branch.status_code == 201, branch.text

    try:
        response = await client.get("/api/v1/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["role_name"] == "Gym Owner"
        assert len(data["branches"]) >= 1
        mine = next(b for b in data["branches"] if b["id"] == branch.json()["id"])
        assert set(mine) >= {"id", "name", "timezone"}
        assert mine["timezone"] == "Europe/Berlin"
    finally:
        # test_branch_crud asserts gym_a's branch-name set EXACTLY — remove
        # the branch we made.
        deleted = await client.delete(
            f"/api/v1/branches/{branch.json()['id']}", headers=headers
        )
        assert deleted.status_code == 204, deleted.text


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
    assert {"members.manage", "attendance.manage", "identity.manage"} <= codes

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
            "permission_codes": ["members.view", "attendance.manage"],
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

    # Two-tier semantics: manage implies view in the effective permission set.
    manage_only = await client.post(
        "/api/v1/permissions/roles",
        headers=headers,
        json={
            "name": "Manage Only",
            "permission_codes": ["members.manage"],
            "branch_scope": "all",
        },
    )
    assert manage_only.status_code == 201, manage_only.text
    employee = await client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "email": "manage-only@example.com",
            "full_name": "Manage Only",
            "password": "Manage-Only-123!",
            "role_ids": [manage_only.json()["id"]],
        },
    )
    assert employee.status_code == 201, employee.text
    emp_tokens = await login(client, "manage-only@example.com", "Manage-Only-123!")
    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {emp_tokens['access_token']}"},
    )
    assert me.status_code == 200
    assert {"members.manage", "members.view"} <= set(me.json()["permissions"])


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

    # Email is frozen for non-platform users too.
    frozen = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": "someone-else@example.com"}
    )
    assert frozen.status_code == 403, frozen.text
    assert frozen.json()["error"]["code"] == "EMAIL_FROZEN"

    # Restoring the original name keeps the suite state clean for gym_a.
    restore = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": original_name}
    )
    assert restore.status_code == 200, restore.text


async def test_update_me_email_conflict_other_tenant(client, gym_a, gym_b):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    # Email is frozen for every user — the cross-tenant claim below is rejected
    # with 403 EMAIL_FROZEN before any uniqueness probe runs.
    response = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": "owner-gymb@example.com"}
    )
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "EMAIL_FROZEN"


async def test_update_me_email_frozen_non_platform(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    current_email = before.json()["user"]["email"]

    # Any different email → 403 EMAIL_FROZEN (case-insensitive comparison).
    response = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"email": "Mixed.Case.Me@Test.COM"},
    )
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "EMAIL_FROZEN"

    # Same email (no-op) is still allowed — passes the guard, returns 200.
    noop = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": current_email}
    )
    assert noop.status_code == 200, noop.text

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["user"]["email"] == current_email


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


async def _set_must_change(client, *, flag: bool) -> str:
    """Flip must_change on gym-a owner's credential, THEN log in so the minted
    access token carries the claim (the gate reads the JWT claim)."""
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    async with maker() as session:
        await session.begin()
        user_id = await session.scalar(
            select(User.id).where(User.email == "owner-gyma@example.com")
        )
        cred = await session.scalar(
            select(Credential).where(Credential.user_id == user_id)
        )
        cred.must_change = flag
        await session.commit()
    reset_tenant_context(token_ctx)
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-gyma@example.com", "password": "owner-pass-123"},
    )
    assert login_res.status_code == 200, login_res.text
    body = login_res.json()
    assert body.get("must_change") is flag, (
        f"login must_change={body.get('must_change')!r} but credential flag={flag!r}"
    )
    return login_res.json()["access_token"]


async def _restore_password(email: str, password: str) -> None:
    """Direct-DB reset of a shared-fixture password (the API rejects weak
    passwords now, so tests can't round-trip back to owner-pass-123)."""
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    async with maker() as session:
        await session.begin()
        user_id = await session.scalar(select(User.id).where(User.email == email))
        cred = await session.scalar(select(Credential).where(Credential.user_id == user_id))
        cred.password_hash = hash_password(password)
        cred.must_change = False
        await session.commit()
    reset_tenant_context(token_ctx)


async def test_must_change_blocks_protected_routes(client, gym_a):
    token = await _set_must_change(client, flag=True)
    res = await client.get(
        "/api/v1/members", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403, res.text
    # main.py's AppError handler returns {"error": {...}} (detail wrapper
    # stripped), matching the shape sibling tests assert (see test_plans.py).
    assert res.json()["error"]["code"] == "MUST_CHANGE_PASSWORD"
    # Reset even here so a -k run of only this test cannot leave the
    # session-scoped gym_a owner flagged for later tests.
    await _set_must_change(client, flag=False)


async def test_change_password_clears_flag_and_rotates(client, gym_a):
    token = await _set_must_change(client, flag=True)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "owner-pass-123", "new_password": "Owner-Pass-123!"},
    )
    assert res.status_code == 200, res.text
    try:
        body = res.json()
        assert body["must_change"] is False

        new_headers = {"Authorization": f"Bearer {body['access_token']}"}
        ok = await client.get("/api/v1/members", headers=new_headers)
        assert ok.status_code == 200, ok.text

        # Flag is cleared in the DB too — a fresh login with the NEW password works.
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "owner-gyma@example.com", "password": "Owner-Pass-123!"},
        )
        assert login_res.status_code == 200
        assert login_res.json()["must_change"] is False
    finally:
        # Restore the shared fixture password even if an assert above fails
        # (direct DB — the API can't set a weak password anymore).
        await _restore_password("owner-gyma@example.com", "owner-pass-123")


async def test_change_password_rejects_wrong_current(client, gym_a):
    token = await _set_must_change(client, flag=True)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "wrong-password", "new_password": "owner-pass-123"},
    )
    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
    # Leave the shared fixture user unflagged for any test that runs after us.
    await _set_must_change(client, flag=False)


async def test_avatar_query_token_not_blocked_by_gate(client, gym_a):
    """<img> tags authenticate via ?token= only (no Authorization header) —
    the gate must resolve through that path too or every avatar 401s."""
    token = await _set_must_change(client, flag=False)
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    auth_headers = {"Authorization": f"Bearer {owner['access_token']}"}

    branch = await client.post(
        "/api/v1/branches",
        headers=auth_headers,
        json={"name": "Avatar Branch", "code": "AV", "timezone": "Asia/Kolkata"},
    )
    assert branch.status_code == 201, branch.text
    plan = await client.post(
        "/api/v1/plans",
        headers=auth_headers,
        json={
            "name": "Avatar Monthly",
            "slug": "avatar-gate-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    created = await client.post(
        "/api/v1/members",
        headers=auth_headers,
        json={
            "first_name": "Ava",
            "last_name": "Tarf",
            "email": "avatar-gate@example.com",
            "phone": "+919900000013",
            "branch_id": branch.json()["id"],
            "plan_id": plan.json()["id"],
        },
    )
    assert created.status_code == 201, created.text
    member_id = created.json()["id"]

    # Unflagged, query token only. The member has no avatar image, so the
    # route's own 404 ("No avatar") proves the gate did NOT intercept with
    # a 401 — permission check passed and handler logic ran.
    res = await client.get(
        f"/api/v1/members/{member_id}/avatar", params={"token": token}
    )
    assert res.status_code == 404, res.text

    # Flagged, query token only: the gate must still fire via the query path.
    flagged = await _set_must_change(client, flag=True)
    res = await client.get(
        f"/api/v1/members/{member_id}/avatar", params={"token": flagged}
    )
    assert res.status_code == 403, res.text
    assert res.json()["error"]["code"] == "MUST_CHANGE_PASSWORD"

    # test_branch_crud asserts gym_a's branch-name set EXACTLY, and
    # test_auth.py runs first alphabetically — remove the branch we made.
    deleted = await client.delete(
        f"/api/v1/branches/{branch.json()['id']}", headers=auth_headers
    )
    assert deleted.status_code == 204, deleted.text

    await _set_must_change(client, flag=False)


async def test_refresh_carries_must_change_claim(client, gym_a):
    """Refresh must re-read the DB flag, not trust whatever the old JWT said."""
    await _set_must_change(client, flag=True)
    tokens = await login(client, "owner-gyma@example.com", "owner-pass-123")
    assert tokens["must_change"] is True

    res = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert res.status_code == 200, res.text
    assert res.json()["must_change"] is True

    await _set_must_change(client, flag=False)


async def test_change_password_revokes_old_refresh_token(client, gym_a):
    """The pair minted by change-password works; the pre-change refresh token
    is revoked and cannot be replayed."""
    await _set_must_change(client, flag=True)
    tokens = await login(client, "owner-gyma@example.com", "owner-pass-123")

    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"current_password": "owner-pass-123", "new_password": "Owner-Pass-123!"},
    )
    assert res.status_code == 200, res.text

    try:
        stale = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert stale.status_code == 401, stale.text

        rotated = await client.post(
            "/api/v1/auth/refresh", json={"refresh_token": res.json()["refresh_token"]}
        )
        assert rotated.status_code == 200, rotated.text
    finally:
        # Restore the shared fixture password even if an assert above fails.
        await _restore_password("owner-gyma@example.com", "owner-pass-123")
    await _set_must_change(client, flag=False)


async def test_change_password_rejects_weak_new(client, gym_a):
    token = await _set_must_change(client, flag=False)
    weak_samples = [
        ("alllowercase1!", ["uppercase"]),
        ("ALLUPPERCASE1!", ["lowercase"]),
        ("NoDigits!!xx", ["digit"]),
        ("NoSpecial123", ["special"]),
        ("Ab1!", ["length"]),
        ("owner-pass-123", ["uppercase"]),
        ("", ["uppercase", "lowercase", "digit", "special", "length"]),
    ]
    for weak, expected_failed in weak_samples:
        res = await client.post(
            "/api/v1/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "owner-pass-123", "new_password": weak},
        )
        assert res.status_code == 422, (weak, res.text)
        body = res.json()["error"]
        assert body["code"] == "PASSWORD_TOO_WEAK", (weak, body)
        assert body["details"]["failed"] == expected_failed, (weak, body["details"])


async def test_change_password_accepts_strong_new(client, gym_a):
    token = await _set_must_change(client, flag=False)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "owner-pass-123", "new_password": "Owner-Pass-123!"},
    )
    assert res.status_code == 200, res.text
    try:
        login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "owner-gyma@example.com", "password": "Owner-Pass-123!"},
        )
        assert login_res.status_code == 200, login_res.text
    finally:
        # Restore the shared fixture password even if the login assert fails.
        await _restore_password("owner-gyma@example.com", "owner-pass-123")


async def test_change_password_wrong_current_checked_before_strength(client, gym_a):
    token = await _set_must_change(client, flag=False)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "wrong-password", "new_password": "alllowercase1!"},
    )
    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"


async def test_update_me_first_last_name(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original = before.json()["user"]["full_name"]

    try:
        res = await client.patch(
            "/api/v1/auth/me",
            headers=headers,
            json={"first_name": "Ada", "last_name": "Lovelace"},
        )
        assert res.status_code == 200, res.text
        body = res.json()["user"]
        assert body["first_name"] == "Ada"
        assert body["last_name"] == "Lovelace"
        assert body["full_name"] == "Ada Lovelace"

        # Legacy full_name path keeps the split columns in sync too.
        res2 = await client.patch(
            "/api/v1/auth/me", headers=headers, json={"full_name": original}
        )
        assert res2.status_code == 200, res2.text
        me = (await client.get("/api/v1/auth/me", headers=headers)).json()["user"]
        assert me["full_name"] == original
        parts = original.split(" ", 1)
        assert me["first_name"] == parts[0]
        assert me["last_name"] == (parts[1] if len(parts) > 1 else "")
    finally:
        # Restore the shared gym_a owner even when mid-test asserts fail.
        restore_res = await client.patch(
            "/api/v1/auth/me", headers=headers, json={"full_name": original}
        )
        assert restore_res.status_code == 200, restore_res.text


async def test_update_me_platform_email_frozen(client, platform_token):
    headers = {"Authorization": f"Bearer {platform_token}"}
    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original_full = before.json()["user"]["full_name"]

    try:
        # Split-name update works for platform actors.
        res = await client.patch(
            "/api/v1/auth/me",
            headers=headers,
            json={"first_name": "Frozen", "last_name": "Admin"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["user"]["full_name"] == "Frozen Admin"
        assert res.json()["user"]["first_name"] == "Frozen"

        # Same email in different casing is NOT a change — allowed, no-op.
        same = await client.patch(
            "/api/v1/auth/me", headers=headers, json={"email": "Platform@Example.com"}
        )
        assert same.status_code == 200, same.text
        assert same.json()["user"]["email"] == "platform@example.com"

        # A genuinely different email is rejected for platform actors.
        frozen = await client.patch(
            "/api/v1/auth/me", headers=headers, json={"email": "not-frozen@example.com"}
        )
        assert frozen.status_code == 403, frozen.text
        assert frozen.json()["error"]["code"] == "EMAIL_FROZEN"

        # Email untouched after the rejected attempt.
        me = (await client.get("/api/v1/auth/me", headers=headers)).json()
        assert me["user"]["email"] == "platform@example.com"
    finally:
        # Restore the seeded name so later runs see the original state.
        restore_res = await client.patch(
            "/api/v1/auth/me", headers=headers, json={"full_name": original_full}
        )
        assert restore_res.status_code == 200, restore_res.text


@pytest.mark.parametrize(
    ("payload", "expect_error_code"),
    [
        # first-only: last_name must stay untouched (dynamic read below).
        ({"first_name": "Solo"}, None),
        # last-only: first_name must stay untouched.
        ({"last_name": "Byron"}, None),
        # Whitespace first_name strips to "" → min_length=1 → schema 422
        # (pydantic envelope, no {"error": ...} code to assert).
        ({"first_name": "   "}, None),
        # 100-char parts pass the schema but compose to 201 chars → service
        # guard rejects with the app error envelope.
        ({"first_name": "A" * 100, "last_name": "B" * 100}, "VALIDATION"),
    ],
)
async def test_update_me_single_field_fallbacks(
    client, gym_a, payload, expect_error_code
):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    before = (await client.get("/api/v1/auth/me", headers=headers)).json()["user"]
    original_first, original_last = before["first_name"], before["last_name"]

    try:
        res = await client.patch("/api/v1/auth/me", headers=headers, json=payload)
        if expect_error_code is not None:
            assert res.status_code == 422, res.text
            assert res.json()["error"]["code"] == expect_error_code, res.text
            return
        if payload.get("first_name") is not None and not payload["first_name"].strip():
            assert res.status_code == 422, res.text  # schema-level
            return
        assert res.status_code == 200, res.text
        body = res.json()["user"]
        if "first_name" in payload:
            assert body["first_name"] == payload["first_name"]
            assert body["last_name"] == original_last  # unchanged
        else:
            assert body["last_name"] == payload["last_name"]
            assert body["first_name"] == original_first  # unchanged
    finally:
        restore = await client.patch(
            "/api/v1/auth/me",
            headers=headers,
            json={"first_name": original_first, "last_name": original_last},
        )
        assert restore.status_code == 200, restore.text
