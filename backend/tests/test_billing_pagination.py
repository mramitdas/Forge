from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.billing.models import Invoice
from sqlalchemy import update

from tests.helpers import login, provision_gym


async def _seed_gym_with_invoices(client, platform_token, slug: str):
    """Owner + 3 members each subscribed → 3 open invoices (tied issue_date)."""
    gym = await provision_gym(client, platform_token, slug)
    tokens = await login(client, f"owner-{slug}@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    plan = await client.post(
        "/api/v1/plans",
        headers=headers,
        json={
            "name": f"Bill Plan {slug}",
            "slug": f"bill-plan-{slug}",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    branch = await client.post(
        "/api/v1/branches",
        headers=headers,
        json={"name": "Billing Branch"},
    )
    assert branch.status_code == 201, branch.text
    branch_id = branch.json()["id"]
    inv_ids = []
    for i in range(3):
        member = await client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": f"Buddy{i}",
                "last_name": "Rawat",
                "email": f"buddy{i}-{slug}@example.com",
                "gender": "Male",
                "status": "active",
                "branch_id": branch_id,
            },
        )
        assert member.status_code == 201, member.text
        sub = await client.post(
            "/api/v1/plans/subscribe",
            headers=headers,
            json={
                "member_id": member.json()["id"],
                "plan_id": plan.json()["id"],
                "branch_id": branch_id,
            },
        )
        assert sub.status_code == 201, sub.text
        inv = await client.get(
            "/api/v1/invoices",
            headers=headers,
            params={"member_id": member.json()["id"]},
        )
        assert inv.status_code == 200, inv.text
        inv_ids.append(inv.json()["items"][0]["id"])
    # Force identical issue_date so the id tiebreaker is exercised.
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            await session.execute(
                update(Invoice).values(issue_date=datetime.now(UTC))
            )
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)
    return headers, inv_ids, gym["id"]


async def test_invoices_offset_pagination_q_and_member_filter(client, platform_token):
    headers, inv_ids, _gym_id = await _seed_gym_with_invoices(client, platform_token, "invpage")

    # Paged contract: dict with items/total/page/page_size.
    paged: list[str] = []
    for page in (1, 2):
        res = await client.get(
            "/api/v1/invoices",
            headers=headers,
            params={"page": page, "page_size": 2},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["total"] >= 3
        assert body["page"] == page
        assert body["page_size"] == 2
        paged.extend(item["id"] for item in body["items"])
    assert len(paged) == len(set(paged)), "no duplicate rows across pages"

    # Stable order for tied issue_date: id DESC.
    res = await client.get(
        "/api/v1/invoices", headers=headers, params={"page_size": 100}
    )
    seeded_order = [i["id"] for i in res.json()["items"] if i["id"] in set(inv_ids)]
    assert seeded_order == sorted(inv_ids, reverse=True)

    # member_id filter still works under the new shape.
    inv0 = next(i for i in res.json()["items"] if i["id"] == inv_ids[0])
    one = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"member_id": inv0["member_id"], "page_size": 100},
    )
    assert one.json()["items"], "member filter returns rows"
    assert all(i["id"] in set(inv_ids) for i in one.json()["items"])

    # Server-side q: member name.
    by_name = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"q": "buddy1", "page_size": 100},
    )
    assert by_name.status_code == 200
    assert by_name.json()["total"] == 1
    assert by_name.json()["items"][0]["id"] == inv_ids[1]

    # Server-side q: invoice number (case-insensitive).
    target = next(i for i in res.json()["items"] if i["id"] == inv_ids[2])
    by_number = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"q": target["number"].lower(), "page_size": 100},
    )
    assert by_number.json()["total"] == 1
    assert by_number.json()["items"][0]["id"] == inv_ids[2]


async def test_invoice_summary_buckets(client, platform_token):
    headers, inv_ids, gym_id = await _seed_gym_with_invoices(client, platform_token, "invsum")

    first = await client.get("/api/v1/invoices/summary", headers=headers)
    assert first.status_code == 200, first.text
    body = first.json()
    # Plans carry an 18% default tax; take the real total from the list.
    listed = (
        await client.get("/api/v1/invoices", headers=headers, params={"page_size": 100})
    ).json()["items"]
    unit_total = next(i for i in listed if i["id"] == inv_ids[0])["total_minor"]
    assert body["outstanding_minor"] == unit_total * 3
    assert body["collected_minor"] == 0
    assert body["overdue_minor"] == 0

    pay = await client.post(
        f"/api/v1/invoices/{inv_ids[0]}/pay",
        headers=headers,
        json={"method": "cash", "idempotency_key": "sum-pay-1"},
    )
    assert pay.status_code == 200, pay.text
    void = await client.post(f"/api/v1/invoices/{inv_ids[1]}/void", headers=headers)
    assert void.status_code == 200, void.text

    after = (await client.get("/api/v1/invoices/summary", headers=headers)).json()
    assert after["outstanding_minor"] == unit_total  # void excluded
    assert after["collected_minor"] == unit_total
    assert after["overdue_minor"] == 0

    # Past-due partial counts its residual as overdue (Bug-10 semantics).
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym_id))))
    try:
        async with maker() as session:
            await session.begin()
            await session.execute(
                update(Invoice)
                .where(Invoice.id == uuid.UUID(inv_ids[2]))
                .values(
                    status="partial",
                    paid_minor=40000,
                    due_date=datetime.now(UTC) - timedelta(days=3),
                )
            )
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)

    past = (await client.get("/api/v1/invoices/summary", headers=headers)).json()
    assert past["outstanding_minor"] == unit_total - 40000
    assert past["overdue_minor"] == unit_total - 40000
