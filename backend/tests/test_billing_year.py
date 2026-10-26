from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.billing.models import Invoice, Payment
from sqlalchemy import select, update

from tests.test_billing_pagination import _seed_gym_with_invoices

CURRENT_YEAR = datetime.now(UTC).year
LAST_YEAR = CURRENT_YEAR - 1


async def _move_invoice_and_payment(
    gym_id: str, invoice_id: str, *, when: datetime
) -> None:
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym_id))))
    try:
        async with maker() as session:
            await session.begin()
            await session.execute(
                update(Invoice)
                .where(Invoice.id == uuid.UUID(invoice_id))
                .values(issue_date=when, due_date=when)
            )
            payment = (
                await session.execute(
                    select(Payment).where(Payment.invoice_id == uuid.UUID(invoice_id))
                )
            ).scalar_one_or_none()
            if payment is not None:
                payment.paid_at = when
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)


async def test_invoice_list_filters_by_issue_year(client, platform_token):
    headers, inv_ids, gym_id = await _seed_gym_with_invoices(
        client, platform_token, "invyearlist"
    )
    await _move_invoice_and_payment(
        gym_id, inv_ids[0], when=datetime(LAST_YEAR, 6, 15, tzinfo=UTC)
    )

    current = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"year": CURRENT_YEAR, "page_size": 100},
    )
    assert current.status_code == 200, current.text
    current_ids = {item["id"] for item in current.json()["items"]}
    assert inv_ids[0] not in current_ids
    assert {inv_ids[1], inv_ids[2]} <= current_ids
    assert current.json()["total"] == 2

    previous = await client.get(
        "/api/v1/invoices",
        headers=headers,
        params={"year": LAST_YEAR, "page_size": 100},
    )
    assert previous.status_code == 200, previous.text
    assert [item["id"] for item in previous.json()["items"]] == [inv_ids[0]]
    assert previous.json()["total"] == 1


async def test_summary_tracks_cash_received_in_the_selected_year(
    client, platform_token
):
    headers, inv_ids, gym_id = await _seed_gym_with_invoices(
        client, platform_token, "invyearsum"
    )
    listed = (
        await client.get(
            "/api/v1/invoices", headers=headers, params={"page_size": 100}
        )
    ).json()["items"]
    unit_total = next(i for i in listed if i["id"] == inv_ids[0])["total_minor"]

    paid = await client.post(
        f"/api/v1/invoices/{inv_ids[0]}/pay",
        headers=headers,
        json={"method": "cash", "idempotency_key": "year-sum-pay-1"},
    )
    assert paid.status_code == 200, paid.text
    await _move_invoice_and_payment(
        gym_id, inv_ids[0], when=datetime(LAST_YEAR, 6, 15, tzinfo=UTC)
    )

    current = (
        await client.get(
            "/api/v1/invoices/summary",
            headers=headers,
            params={"year": CURRENT_YEAR},
        )
    ).json()
    assert current["collected_minor"] == 0
    assert current["outstanding_minor"] == unit_total * 2
    assert current["monthly"].get("jun", 0) == 0

    previous = (
        await client.get(
            "/api/v1/invoices/summary",
            headers=headers,
            params={"year": LAST_YEAR},
        )
    ).json()
    assert previous["collected_minor"] == unit_total
    assert previous["outstanding_minor"] == 0
    assert previous["monthly"]["jun"] == unit_total

    # Omitting year keeps the all-time contract used elsewhere.
    all_time = (
        await client.get("/api/v1/invoices/summary", headers=headers)
    ).json()
    assert all_time["collected_minor"] == unit_total
    assert all_time["outstanding_minor"] == unit_total * 2
