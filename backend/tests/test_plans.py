from __future__ import annotations

from tests.helpers import login

_counter = 0


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


_branch_counter = 0


async def _create_branch(client, token: str, name: str = "Annex") -> dict:
    # Unique per call: gym_a is session-scoped and codes are unique per gym.
    global _branch_counter
    _branch_counter += 1
    response = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": name,
            "code": f"AX{_branch_counter}",
            "timezone": "Asia/Kolkata",
            "country_code": "+91",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_plan(client, token: str, slug: str, **overrides) -> dict:
    payload = {
        "name": "Monthly Flex",
        "slug": slug,
        "billing_period": "monthly",
        "amount_minor": 150000,
        "entry_fee_minor": 5000,
        "tax_rate_bp": 1800,
        "duration_months": 1,
        "auto_renew": True,
    }
    payload.update(overrides)
    response = await client.post(
        "/api/v1/plans", headers=_headers(token), json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_plan_crud_with_branch_scope(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)

    common = await _create_plan(client, token, "flex-monthly")
    assert common["branch_id"] is None
    assert common["is_active"] is True

    scoped = await _create_plan(client, token, "annex-monthly", branch_id=branch["id"])
    assert scoped["branch_id"] == branch["id"]

    updated = await client.patch(
        f"/api/v1/plans/{common['id']}",
        headers=_headers(token),
        json={"amount_minor": 180000, "branch_id": branch["id"]},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["amount_minor"] == 180000
    assert updated.json()["branch_id"] == branch["id"]

    made_common = await client.patch(
        f"/api/v1/plans/{scoped['id']}",
        headers=_headers(token),
        json={"branch_id": None},
    )
    assert made_common.status_code == 200, made_common.text
    assert made_common.json()["branch_id"] is None

    disabled = await client.patch(
        f"/api/v1/plans/{common['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False

    listed = await client.get("/api/v1/plans", headers=_headers(token))
    assert listed.status_code == 200
    by_slug = {p["slug"]: p for p in listed.json()}
    assert by_slug["flex-monthly"]["is_active"] is False

    # gym_a is session-scoped and shared with other test files, so the
    # listing also contains their global plans. Assert the branch filter's
    # real contract: global + this-branch plans in, other-branch plans out.
    other_branch = await _create_branch(client, token, "Other")
    other_scoped = await _create_plan(
        client, token, "other-branch-plan", branch_id=other_branch["id"]
    )

    filtered = await client.get(
        f"/api/v1/plans?branch_id={branch['id']}", headers=_headers(token)
    )
    assert filtered.status_code == 200
    filtered_slugs = {p["slug"] for p in filtered.json()}
    assert {"flex-monthly", "annex-monthly"} <= filtered_slugs
    assert other_scoped["slug"] not in filtered_slugs

    deleted = await client.delete(
        f"/api/v1/plans/{scoped['id']}", headers=_headers(token)
    )
    assert deleted.status_code == 204, deleted.text

    listed = await client.get("/api/v1/plans", headers=_headers(token))
    listed_slugs = {p["slug"] for p in listed.json()}
    assert "flex-monthly" in listed_slugs
    assert "annex-monthly" not in listed_slugs


async def test_plan_slug_duplicate_rejected(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    await _create_plan(client, token, "dup-monthly")

    response = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Duplicate",
            "slug": "dup-monthly",
            "billing_period": "monthly",
            "amount_minor": 99900,
        },
    )
    assert response.status_code == 409


async def test_subscription_rejects_disabled_or_foreign_branch_plan(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_a = await _create_branch(client, token, "A")
    branch_b = await _create_branch(client, token, "B")

    base = await _create_plan(client, token, "grace-base")
    member = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": "Grace",
            "last_name": "Hopper",
            "email": f"grace-plans-{branch_a['id'][:8]}@example.com",
            "phone": "+919800000001",
            "branch_id": branch_a["id"],
            "status": "active",
            "plan_id": base["id"],
        },
    )
    assert member.status_code == 201, member.text

    scoped = await _create_plan(client, token, "scoped-a", branch_id=branch_a["id"])
    wrong_branch = await client.post(
        "/api/v1/plans/subscribe",
        headers=_headers(token),
        json={
            "member_id": member.json()["id"],
            "plan_id": scoped["id"],
            "branch_id": branch_b["id"],
        },
    )
    assert wrong_branch.status_code == 409
    assert wrong_branch.json()["error"]["code"] == "PLAN_BRANCH_MISMATCH"

    await client.patch(
        f"/api/v1/plans/{scoped['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    disabled = await client.post(
        "/api/v1/plans/subscribe",
        headers=_headers(token),
        json={
            "member_id": member.json()["id"],
            "plan_id": scoped["id"],
            "branch_id": branch_a["id"],
        },
    )
    assert disabled.status_code == 409
    assert disabled.json()["error"]["code"] == "PLAN_DISABLED"


async def test_plan_is_tenant_scoped(client, gym_a, gym_b):
    owner_a = await login(client, "owner-gyma@example.com", "owner-pass-123")
    owner_b = await login(client, "owner-gymb@example.com", "owner-pass-123")
    plan = await _create_plan(client, owner_a["access_token"], "tenant-only")

    patch = await client.patch(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(owner_b["access_token"]),
        json={"name": "Hijack"},
    )
    assert patch.status_code == 404

    delete = await client.delete(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(owner_b["access_token"]),
    )
    assert delete.status_code == 404


async def test_plan_duration_periods_roundtrip(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]

    six = await _create_plan(
        client,
        token,
        "dur-six",
        name="Six Month Plan",
        billing_period="semiannual",
        duration_months=6,
    )
    assert six["billing_period"] == "semiannual"
    assert six["duration_months"] == 6

    twelve = await _create_plan(
        client,
        token,
        "dur-twelve",
        name="Twelve Month Plan",
        billing_period="annual",
        duration_months=12,
    )
    assert twelve["billing_period"] == "annual"
    assert twelve["duration_months"] == 12


async def test_disabled_plan_rejects_detail_updates(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    plan = await _create_plan(client, token, "dis-guard", name="Guard Plan")

    disabled = await client.patch(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["is_active"] is False

    rename = await client.patch(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(token),
        json={"name": "Sneaky Rename"},
    )
    assert rename.status_code == 409, rename.text
    body = rename.json()
    assert (body.get("error") or body.get("detail") or {}).get("code") == "PLAN_DISABLED"

    repriced = await client.patch(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(token),
        json={"amount_minor": 99900},
    )
    assert repriced.status_code == 409, repriced.text

    enabled = await client.patch(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(token),
        json={"is_active": True},
    )
    assert enabled.status_code == 200, enabled.text

    renamed = await client.patch(
        f"/api/v1/plans/{plan['id']}",
        headers=_headers(token),
        json={"name": "Now Editable"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Now Editable"
