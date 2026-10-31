from __future__ import annotations

import uuid

from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.kernel.pagination import OffsetPagination
from app.modules.expenses.service import list_expenses

from tests.helpers import login, provision_gym


async def test_list_expenses_offset_pagination_is_stable_for_tied_paid_at(
    client, platform_token
):
    # The FE writes date-picker values as midnight UTC, so same-day expenses
    # share an identical paid_at. Offset pagination must apply a deterministic
    # tiebreaker (id DESC) or rows can repeat/ vanish across page boundaries.
    gym = await provision_gym(client, platform_token, "gympagination")
    assert gym["slug"] == "gympagination"
    tokens = await login(
        client, "owner-gympagination@example.com", "owner-pass-123"
    )
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    day1 = "2026-01-15T00:00:00Z"
    day2 = "2026-02-15T00:00:00Z"
    day3 = "2026-03-15T00:00:00Z"
    seeded: list[tuple[str, str]] = []  # (paid_at, id)
    for paid_at in (day1, day1, day1, day2, day2, day3):
        response = await client.post(
            "/api/v1/expenses",
            headers=headers,
            json={
                "category": "Rent",
                "amount_minor": 10000,
                "method": "cash",
                "paid_at": paid_at,
            },
        )
        assert response.status_code == 201, response.text
        seeded.append((paid_at, response.json()["id"]))

    # Contract: paid_at DESC, then id DESC within each tie group.
    expected_order = [
        expense_id
        for _, expense_id in sorted(seeded, key=lambda pair: pair, reverse=True)
    ]

    maker = get_sessionmaker()
    tenant_id = uuid.UUID(str(gym["id"]))
    token_ctx = set_tenant_context(TenantContext(tenant_id=tenant_id))
    paged_ids: list[str] = []
    try:
        async with maker() as session:
            await session.begin()
            for page in (1, 2, 3):
                rows, total = await list_expenses(
                    session,
                    tenant_id=tenant_id,
                    pagination=OffsetPagination(page=page, page_size=2),
                )
                assert total == 6
                paged_ids.extend(str(row.id) for row in rows)
            await session.rollback()
    finally:
        reset_tenant_context(token_ctx)

    # Full coverage: every seeded expense appears exactly once across pages.
    assert len(paged_ids) == 6
    assert sorted(paged_ids) == sorted(expense_id for _, expense_id in seeded)
    # Deterministic order within paid_at ties: newest id first.
    assert paged_ids == expected_order
