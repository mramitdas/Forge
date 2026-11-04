"""Invoice numbering is race-safe and unique per tenant."""

from __future__ import annotations

import asyncio

from app.db.session import get_sessionmaker
from sqlalchemy import text

from tests.helpers import login, provision_gym


async def test_migration_added_uniqueness_constraints():
    """The two audit fixes are enforced by DB constraints."""
    maker = get_sessionmaker()
    async with maker() as session:
        rows = await session.execute(
            text(
                "SELECT conname FROM pg_constraint "
                "WHERE conname IN "
                "('uq_invoice_tenant_number', 'uq_invoice_seq_tenant_year')"
            )
        )
        assert len({r[0] for r in rows.fetchall()}) == 2


async def test_concurrent_subscription_creation_yields_distinct_numbers(
    client, platform_token
):
    """First invoices of a year created concurrently must not share numbers."""
    await provision_gym(client, platform_token, "invrace")
    tokens = await login(client, "owner-invrace@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    plan = await client.post(
        "/api/v1/plans",
        headers=headers,
        json={
            "name": "Race Plan",
            "slug": "race-plan",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    branch = await client.post("/api/v1/branches", headers=headers, json={"name": "RaceBranch"})
    assert branch.status_code == 201, branch.text
    branch_id = branch.json()["id"]

    # First invoice of the tenant-year: two concurrent member creations each
    # create a subscription invoice; they race on the counter row via the
    # ON CONFLICT DO NOTHING + FOR UPDATE path.
    responses = await asyncio.gather(
        client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": "Race0",
                "last_name": "Rawat",
                "email": "race0-invrace@example.com",
                "gender": "Male",
                "status": "active",
                "branch_id": branch_id,
                "plan_id": plan.json()["id"],
            },
        ),
        client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": "Race1",
                "last_name": "Rawat",
                "email": "race1-invrace@example.com",
                "gender": "Male",
                "status": "active",
                "branch_id": branch_id,
                "plan_id": plan.json()["id"],
            },
        ),
    )

    for r in responses:
        assert r.status_code == 201, r.text

    invoices = await client.get("/api/v1/invoices", headers=headers)
    numbers = [item["number"] for item in invoices.json()["items"]]
    year = numbers[0].split("-")[1]
    assert all(n.split("-")[1] == year for n in numbers), numbers
    assert len(numbers) == len(set(numbers)), f"duplicate invoice numbers: {numbers}"
