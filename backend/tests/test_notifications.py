from __future__ import annotations

from tests.helpers import login, provision_gym
from tests.test_member_account import _create_branch, _create_member


async def test_payment_notification_uses_invoice_number(
    client, platform_token, dispatcher
):
    """The payment notification must read `INV-…`, not a raw UUID.

    Uses a dedicated gym so the shared session fixtures stay untouched (the
    notification feed is user-scoped and would leak across tests).
    """
    await provision_gym(client, platform_token, "notify")
    owner = await login(client, "owner-notify@example.com", "owner-pass-123")
    token = owner["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    branch = await _create_branch(client, token, name="Notify")
    member = await _create_member(client, token, branch["id"])
    plan = await client.post(
        "/api/v1/plans",
        headers=headers,
        json={
            "name": "Notify Monthly",
            "slug": "notify-monthly",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    sub = await client.post(
        "/api/v1/plans/subscribe",
        headers=headers,
        json={
            "member_id": member["id"],
            "plan_id": plan.json()["id"],
            "branch_id": branch["id"],
        },
    )
    assert sub.status_code == 201, sub.text

    invoices = await client.get("/api/v1/invoices", headers=headers)
    invoice = next(i for i in invoices.json() if i["member_id"] == member["id"])
    assert invoice["number"].startswith("INV-"), invoice

    paid = await client.post(
        f"/api/v1/invoices/{invoice['id']}/pay",
        headers=headers,
        json={"method": "upi", "idempotency_key": "idem-notify-0001"},
    )
    assert paid.status_code == 200, paid.text

    # Payments are announced through the transactional outbox; pump the
    # dispatcher so the notification handler actually runs.
    await dispatcher.run_once()

    notifications = await client.get("/api/v1/notifications", headers=headers)
    assert notifications.status_code == 200, notifications.text
    payment_notes = [
        n
        for n in notifications.json()
        if n["title"] == "Payment received"
        and n.get("payload", {}).get("invoice_id") == invoice["id"]
    ]
    assert payment_notes, "payment notification not found"
    body = payment_notes[0]["body"]
    assert invoice["number"] in body, body
    assert invoice["id"] not in body, body
