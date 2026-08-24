from __future__ import annotations

from tests.helpers import login


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _branch_id(client, token: str) -> str:
    response = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={"name": "Test Branch", "code": "TB", "timezone": "Asia/Kolkata"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _create_plan(client, token: str, slug: str) -> dict:
    response = await client.post(
        "/api/v1/plans",
        headers=_headers(token),
        json={
            "name": f"Monthly {slug}",
            "slug": slug,
            "description": "Monthly membership",
            "billing_period": "monthly",
            "amount_minor": 120000,
            "entry_fee_minor": 10000,
            "tax_rate_bp": 1800,
            "duration_months": 1,
            "auto_renew": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_member(client, token: str, branch_id: str, first_name: str) -> dict:
    response = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": first_name,
            "last_name": "Member",
            "email": f"{first_name.lower()}@example.com",
            "phone": "+919876543210",
            "branch_id": branch_id,
            "status": "prospect",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_full_slice_member_to_checkin(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_id = await _branch_id(client, token)

    # Member lifecycle.
    member = await _create_member(client, token, branch_id, "Riya")
    assert member["status"] == "prospect"

    detail = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert detail.status_code == 200

    # Timeline has the creation entry.
    timeline = await client.get(
        f"/api/v1/members/{member['id']}/timeline", headers=_headers(token)
    )
    assert timeline.status_code == 200
    actions = [t["action"] for t in timeline.json()]
    assert "member.created" in actions

    # Plan creation + subscription (creates an invoice synchronously).
    plan = await _create_plan(client, token, "monthly-riy")
    subscribe = await client.post(
        "/api/v1/plans/subscribe",
        headers=_headers(token),
        json={
            "member_id": member["id"],
            "plan_id": plan["id"],
            "branch_id": branch_id,
        },
    )
    assert subscribe.status_code == 201, subscribe.text
    subscription = subscribe.json()
    assert subscription["status"] == "pending"

    # Invoice exists and is open.
    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    assert invoices.status_code == 200
    invoice = next(i for i in invoices.json() if i["member_id"] == member["id"])
    assert invoice["status"] == "open"
    assert invoice["number"].startswith("INV-")
    assert invoice["total_minor"] == 153400  # (120000 + 10000) + 18% GST

    # Pay the invoice (MockGateway succeeds) with idempotency.
    pay = await client.post(
        f"/api/v1/invoices/{invoice['id']}/pay",
        headers=_headers(token),
        json={"method": "upi", "idempotency_key": "idem-riy-0001"},
    )
    assert pay.status_code == 200, pay.text
    result = pay.json()
    assert result["idempotent_replay"] is False
    assert result["payment"]["status"] == "succeeded"
    assert result["invoice"]["status"] == "paid"

    # Replay the same idempotency key returns the prior result without a new payment.
    pay2 = await client.post(
        f"/api/v1/invoices/{invoice['id']}/pay",
        headers=_headers(token),
        json={"method": "upi", "idempotency_key": "idem-riy-0001"},
    )
    assert pay2.status_code == 200
    assert pay2.json()["idempotent_replay"] is True
    assert pay2.json()["payment"]["id"] == result["payment"]["id"]

    # A second idempotency key on a settled invoice is rejected.
    pay3 = await client.post(
        f"/api/v1/invoices/{invoice['id']}/pay",
        headers=_headers(token),
        json={"method": "upi", "idempotency_key": "idem-riy-0002"},
    )
    assert pay3.status_code == 409

    # Activate the subscription, then check in (allowed).
    activate = await client.post(
        f"/api/v1/plans/subscriptions/{subscription['id']}/activate",
        headers=_headers(token),
    )
    assert activate.status_code == 200
    assert activate.json()["status"] == "active"

    checkin = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch_id, "source": "kiosk"},
    )
    assert checkin.status_code == 201, checkin.text
    assert checkin.json()["result"] == "allowed"

    # Duplicate within the 60s window is recorded as duplicate, not allowed.
    dup = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch_id, "source": "kiosk"},
    )
    assert dup.status_code == 201
    assert dup.json()["result"] == "duplicate"

    # Member is now active (subscription activation flipped the status).
    detail = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert detail.json()["status"] == "active"


async def test_checkin_denied_without_membership(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_id = await _branch_id(client, token)
    member = await _create_member(client, token, branch_id, "Arjun")

    checkin = await client.post(
        "/api/v1/checkin",
        headers=_headers(token),
        json={"member_id": member["id"], "branch_id": branch_id, "source": "manual"},
    )
    assert checkin.status_code == 201
    assert checkin.json()["result"] == "denied"
    assert "no active membership" in checkin.json()["reason"]


async def test_outbox_dispatches_payment_notification(client, dispatcher, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_id = await _branch_id(client, token)
    member = await _create_member(client, token, branch_id, "Kabir")
    plan = await _create_plan(client, token, "monthly-kab")

    await client.post(
        "/api/v1/plans/subscribe",
        headers=_headers(token),
        json={"member_id": member["id"], "plan_id": plan["id"], "branch_id": branch_id},
    )
    invoices = (await client.get("/api/v1/invoices", headers=_headers(token))).json()
    invoice = next(i for i in invoices if i["member_id"] == member["id"])
    await client.post(
        f"/api/v1/invoices/{invoice['id']}/pay",
        headers=_headers(token),
        json={"method": "card", "idempotency_key": "idem-kab-0001"},
    )

    # No notification until the outbox dispatcher runs.
    unread = await client.get(
        "/api/v1/notifications/unread-count", headers=_headers(token)
    )
    assert unread.json()["count"] == 0

    delivered = await dispatcher.run_once()
    assert delivered >= 1

    unread = await client.get(
        "/api/v1/notifications/unread-count", headers=_headers(token)
    )
    assert unread.json()["count"] >= 1

    notifications = await client.get(
        "/api/v1/notifications", headers=_headers(token)
    )
    titles = {n["title"] for n in notifications.json()}
    assert "Payment received" in titles

    # Dispatcher is idempotent: running again delivers nothing new.
    again = await dispatcher.run_once()
    assert again == 0
