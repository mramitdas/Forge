from __future__ import annotations

import pytest

from tests.helpers import login, provision_gym

_counter = 0


@pytest.fixture(scope="module")
async def gym_acct(client, platform_token) -> dict:
    return await provision_gym(client, platform_token, "acct")


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


_branch_counter = 0


async def _create_branch(client, token: str, name: str = "Main") -> dict:
    # Unique per call: the account gym is session-scoped and codes are unique per gym.
    global _branch_counter
    _branch_counter += 1
    response = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": name,
            "code": f"{name[:2].upper() or 'MA'}{_branch_counter}",
            "timezone": "Asia/Kolkata",
            "country_code": "+91",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_member(client, token: str, branch_id: str, **overrides) -> dict:
    global _counter
    _counter += 1
    payload = {
        "first_name": "Ada",
        "last_name": "Lovelace",
        "email": f"ada-acct-{_counter}@example.com",
        "phone": "9000000000",
        "country_code": "+91",
        "gender": "Female",
        "branch_id": branch_id,
        "status": "active",
    }
    payload.update(overrides)
    response = await client.post(
        "/api/v1/members", headers=_headers(token), json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_member_create_defaults_is_active(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])
    assert member["is_active"] is True
    assert member["avatar_path"] is None


async def test_member_enable_disable_toggles_checkin(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Monthly",
            "slug": "acct-monthly",
            "billing_period": "monthly",
            "amount_minor": 100000,
            "auto_renew": False,
            "branch_id": branch["id"],
        },
    )
    assert plan.status_code == 201, plan.text
    sub = await client.post(
        "/api/v1/plans/subscribe",
        headers=_headers(token),
        json={"member_id": member["id"], "plan_id": plan.json()["id"], "branch_id": branch["id"]},
    )
    assert sub.status_code == 201, sub.text
    act = await client.post(
        f"/api/v1/plans/subscriptions/{sub.json()['id']}/activate",
        headers=_headers(token),
    )
    assert act.status_code == 200, act.text
    me = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert me.json()["is_active"] is True

    disabled = await client.patch(
        f"/api/v1/members/{member['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False

    checkin = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch["id"], "source": "manual"},
    )
    assert checkin.status_code == 201
    assert checkin.json()["result"] == "denied"
    assert checkin.json()["reason"] == "member is disabled"

    enabled = await client.patch(
        f"/api/v1/members/{member['id']}",
        headers=_headers(token),
        json={"is_active": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["is_active"] is True

    checkin = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch["id"], "source": "manual"},
    )
    assert checkin.status_code == 201
    assert checkin.json()["result"] in ("allowed", "duplicate")
    assert checkin.json()["reason"] != "member is disabled"


async def test_member_soft_delete(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    deleted = await client.delete(
        f"/api/v1/members/{member['id']}", headers=_headers(token)
    )
    assert deleted.status_code == 204, deleted.text

    listed = await client.get("/api/v1/members", headers=_headers(token))
    assert listed.status_code == 200
    assert member["id"] not in {m["id"] for m in listed.json()["items"]}

    detail = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert detail.status_code == 404


async def test_member_delete_tenant_scoped(client, gym_acct, gym_b):
    owner_a = await login(client, "owner-acct@example.com", "owner-pass-123")
    owner_b = await login(client, "owner-gymb@example.com", "owner-pass-123")
    branch_a = await _create_branch(client, owner_a["access_token"])
    member = await _create_member(client, owner_a["access_token"], branch_a["id"])

    other = await client.delete(
        f"/api/v1/members/{member['id']}",
        headers=_headers(owner_b["access_token"]),
    )
    assert other.status_code == 404


async def test_member_delete_cascades_to_children(client, gym_acct):
    """Deleting a member must also retire their subscription, invoices and check-ins."""
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Cascade Plan",
            "slug": "cascade-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    sub = await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])
    await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/activate", headers=_headers(token)
    )

    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    invoice = next(i for i in invoices.json()["items"] if i["member_id"] == member["id"])
    paid = await client.post(
        f"/api/v1/invoices/{invoice['id']}/pay",
        headers=_headers(token),
        json={"method": "upi", "idempotency_key": "idem-cascade-0001"},
    )
    assert paid.status_code == 200, paid.text

    checkin = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch["id"], "source": "manual"},
    )
    assert checkin.status_code == 201, checkin.text

    deleted = await client.delete(
        f"/api/v1/members/{member['id']}", headers=_headers(token)
    )
    assert deleted.status_code == 204, deleted.text

    subs = await client.get(
        "/api/v1/plans/subscriptions",
        headers=_headers(token),
        params={"member_id": member["id"]},
    )
    assert subs.status_code == 200, subs.text
    assert subs.json() == [], subs.text

    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    assert [i for i in invoices.json()["items"] if i["member_id"] == member["id"]] == []

    attendance = await client.get(
        "/api/v1/checkin",
        headers=_headers(token),
        params={"member_id": member["id"]},
    )
    assert attendance.status_code == 200, attendance.text
    assert attendance.json()["items"] == [], attendance.text


async def _subscribe(client, token, member_id: str, branch_id: str, plan_id: str) -> dict:
    response = await client.post(
        "/api/v1/plans/subscribe",
        headers=_headers(token),
        json={"member_id": member_id, "plan_id": plan_id, "branch_id": branch_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_subscription_renew_extends_term_and_enables_member(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Renew Monthly",
            "slug": "renew-monthly",
            "billing_period": "monthly",
            "amount_minor": 100000,
            "auto_renew": False,
        },
    )
    sub = await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])
    await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/activate", headers=_headers(token)
    )

    await client.patch(
        f"/api/v1/members/{member['id']}",
        headers=_headers(token),
        json={"is_active": False},
    )

    renewed = await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/renew", headers=_headers(token)
    )
    assert renewed.status_code == 200, renewed.text
    assert renewed.json()["status"] == "active"
    assert renewed.json()["end_at"] > sub["end_at"]

    me = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert me.json()["is_active"] is True

    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    assert invoices.status_code == 200
    member_invoices = [i for i in invoices.json()["items"] if i["member_id"] == member["id"]]
    assert len(member_invoices) == 2


async def test_subscription_upgrade_changes_plan(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    basic = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Basic",
            "slug": "upgrade-basic",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    premium = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Premium",
            "slug": "upgrade-premium",
            "billing_period": "quarterly",
            "amount_minor": 300000,
        },
    )
    sub = await _subscribe(client, token, member["id"], branch["id"], basic.json()["id"])
    await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/activate", headers=_headers(token)
    )

    upgraded = await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/upgrade",
        headers=_headers(token),
        json={"plan_id": premium.json()["id"]},
    )
    assert upgraded.status_code == 200, upgraded.text
    assert upgraded.json()["plan_id"] == premium.json()["id"]
    assert upgraded.json()["price_minor"] == 300000


async def test_upgrade_rejects_plan_from_other_branch(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_a = await _create_branch(client, token, "A")
    branch_b = await _create_branch(client, token, "B")
    member = await _create_member(client, token, branch_a["id"])

    scoped = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Scoped B",
            "slug": "upgrade-scoped-b",
            "billing_period": "monthly",
            "amount_minor": 100000,
            "branch_id": branch_b["id"],
        },
    )
    common = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Common",
            "slug": "upgrade-common",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    sub = await _subscribe(client, token, member["id"], branch_a["id"], common.json()["id"])
    await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/activate", headers=_headers(token)
    )

    rejected = await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/upgrade",
        headers=_headers(token),
        json={"plan_id": scoped.json()["id"]},
    )
    assert rejected.status_code == 409


async def test_second_subscription_queues_after_active_one(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Queue Plan",
            "slug": "queue-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    first = await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])
    await client.post(
        f"/api/v1/plans/subscriptions/{first['id']}/activate", headers=_headers(token)
    )
    subs = await client.get(
        "/api/v1/plans/subscriptions",
        headers=_headers(token),
        params={"member_id": member["id"]},
    )
    assert subs.status_code == 200
    first_end = next(s for s in subs.json() if s["id"] == first["id"])["end_at"]

    second = await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])
    assert second["status"] == "pending"
    assert second["start_at"] == first_end


async def test_renew_with_explicit_start_date(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Join Date Plan",
            "slug": "join-date-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
            "auto_renew": False,
        },
    )
    sub = await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])
    await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/activate", headers=_headers(token)
    )

    renewed = await client.post(
        f"/api/v1/plans/subscriptions/{sub['id']}/renew",
        headers=_headers(token),
        json={"start_at": "2026-01-15T00:00:00Z"},
    )
    assert renewed.status_code == 200, renewed.text
    assert renewed.json()["start_at"].startswith("2026-01-15")


async def test_invoice_void_for_unpaid(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Void Plan",
            "slug": "void-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])

    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    invoice = next(i for i in invoices.json()["items"] if i["member_id"] == member["id"])
    voided = await client.post(
        f"/api/v1/invoices/{invoice['id']}/void", headers=_headers(token)
    )
    assert voided.status_code == 200, voided.text
    assert voided.json()["status"] == "void"

    again = await client.post(
        f"/api/v1/invoices/{invoice['id']}/void", headers=_headers(token)
    )
    assert again.status_code == 409


async def test_paid_invoice_cannot_be_voided(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "Void Paid Plan",
            "slug": "void-paid-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])

    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    invoice = next(i for i in invoices.json()["items"] if i["member_id"] == member["id"])
    paid = await client.post(
        f"/api/v1/invoices/{invoice['id']}/pay",
        headers=_headers(token),
        json={"method": "upi", "idempotency_key": "idem-void-0001"},
    )
    assert paid.status_code == 200, paid.text

    voided = await client.post(
        f"/api/v1/invoices/{invoice['id']}/void", headers=_headers(token)
    )
    assert voided.status_code == 409


async def test_invoice_applies_plan_gst(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])

    plan = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": "GST Plan",
            "slug": "gst-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
            "tax_rate_bp": 1800,
        },
    )
    await _subscribe(client, token, member["id"], branch["id"], plan.json()["id"])

    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    invoice = next(i for i in invoices.json()["items"] if i["member_id"] == member["id"])
    assert invoice["tax_minor"] == 18000  # 100000 * 18%
    assert invoice["total_minor"] == 118000
    assert invoice["lines"][0]["tax_rate_bp"] == 1800


async def test_branch_gst_number_roundtrip(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]

    created = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={
            "name": "GST Branch",
            "code": "GB",
            "timezone": "Asia/Kolkata",
            "country_code": "+91",
            "gst_number": "27ABCDE1234F1Z5",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["gst_number"] == "27ABCDE1234F1Z5"

    updated = await client.patch(
        f"/api/v1/branches/{created.json()['id']}",
        headers=_headers(token),
        json={"gst_number": "29XYZWA9999K1Z8"},
    )
    assert updated.status_code == 200
    assert updated.json()["gst_number"] == "29XYZWA9999K1Z8"
