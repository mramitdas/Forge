from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.membership.models import Subscription
from sqlalchemy import update

from tests.helpers import login

_branch_counter = 0


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _branch_id(client, token: str) -> str:
    # Unique per call: gym_a is session-scoped and codes are unique per gym.
    global _branch_counter
    _branch_counter += 1
    response = await client.post(
        "/api/v1/branches",
        headers=_headers(token),
        json={"name": "Test Branch", "code": f"SLC{_branch_counter}", "timezone": "Asia/Kolkata"},
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


async def _create_member(
    client, token: str, branch_id: str, plan_id: str, first_name: str
) -> dict:
    response = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={
            "first_name": first_name,
            "last_name": "Member",
            "email": f"{first_name.lower()}@example.com",
            "phone": "+919876543210",
            "branch_id": branch_id,
            "plan_id": plan_id,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_full_slice_member_to_checkin(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_id = await _branch_id(client, token)

    # Plan + member lifecycle: create activates the subscription atomically.
    plan = await _create_plan(client, token, "monthly-riy")
    member = await _create_member(client, token, branch_id, plan["id"], "Riya")
    assert member["status"] == "active"

    detail = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert detail.status_code == 200

    # Timeline has the creation entry.
    timeline = await client.get(
        f"/api/v1/members/{member['id']}/timeline", headers=_headers(token)
    )
    assert timeline.status_code == 200
    actions = [t["action"] for t in timeline.json()]
    assert "member.created" in actions

    # Subscription is active and its invoice was created synchronously.
    subs = await client.get(
        "/api/v1/plans/subscriptions",
        headers=_headers(token),
        params={"member_id": member["id"]},
    )
    assert subs.status_code == 200
    subscription = next(s for s in subs.json() if s["status"] == "active")
    assert subscription["plan_id"] == plan["id"]

    invoices = await client.get("/api/v1/invoices", headers=_headers(token))
    assert invoices.status_code == 200
    invoice = next(i for i in invoices.json()["items"] if i["member_id"] == member["id"])
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

    # Check in (subscription is already active from member create).
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

    # Member is active.
    detail = await client.get(f"/api/v1/members/{member['id']}", headers=_headers(token))
    assert detail.json()["status"] == "active"


async def test_checkin_denied_without_membership(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch_id = await _branch_id(client, token)
    plan = await _create_plan(client, token, "monthly-arj")
    member = await _create_member(client, token, branch_id, plan["id"], "Arjun")

    # Member create always subscribes; expire the term so no membership is live.
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym_a["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            await session.execute(
                update(Subscription)
                .where(Subscription.member_id == uuid.UUID(member["id"]))
                .values(end_at=datetime.now(UTC) - timedelta(days=1))
            )
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)

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
    plan = await _create_plan(client, token, "monthly-kab")
    member = await _create_member(client, token, branch_id, plan["id"], "Kabir")

    invoices = (await client.get("/api/v1/invoices", headers=_headers(token))).json()
    invoice = next(i for i in invoices["items"] if i["member_id"] == member["id"])
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

    # run_once caps at 100 events and earlier suite tests leave a backlog;
    # drain until idle so this payment is guaranteed to be delivered.
    delivered = 0
    for _ in range(50):
        n = await dispatcher.run_once()
        delivered += n
        if n == 0:
            break
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
