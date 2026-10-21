from __future__ import annotations

from tests.helpers import login


async def _owner_headers(client, slug: str = "gyma") -> dict:
    tokens = await login(client, f"owner-{slug}@example.com", "owner-pass-123")
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def test_owner_can_create_and_list_expenses(client, gym_a, gym_b):
    headers = await _owner_headers(client)
    created = await client.post(
        "/api/v1/expenses",
        headers=headers,
        json={
            "category": "Rent",
            "description": "August rent",
            "amount_minor": 250000,
            "method": "upi",
            "paid_at": "2026-09-24T11:02:47Z",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["category"] == "Rent"
    assert body["amount_minor"] == 250000
    assert body["method"] == "upi"

    listing = await client.get("/api/v1/expenses", headers=headers)
    assert listing.status_code == 200, listing.text
    page = listing.json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == body["id"]

    # Tenant isolation: gym B's owner sees none of gym A's expenses.
    other = await _owner_headers(client, "gymb")
    other_listing = await client.get("/api/v1/expenses", headers=other)
    assert other_listing.json()["total"] == 0


async def test_expenses_require_gym_permission(client, gym_a):
    # Platform users hold platform.* codes only — expenses must 403.
    from tests.conftest import get_settings

    settings = get_settings()
    tokens = await login(client, "platform@example.com", "platform-pass-123")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    listing = await client.get("/api/v1/expenses", headers=headers)
    assert listing.status_code == 403, listing.text
    assert settings is not None


async def test_expense_validation_rejects_bad_input(client, gym_a):
    headers = await _owner_headers(client)
    bad_method = await client.post(
        "/api/v1/expenses",
        headers=headers,
        json={"category": "Rent", "amount_minor": 100, "method": "bitcoin"},
    )
    assert bad_method.status_code == 422, bad_method.text
    bad_amount = await client.post(
        "/api/v1/expenses",
        headers=headers,
        json={"category": "Rent", "amount_minor": -5},
    )
    assert bad_amount.status_code == 422, bad_amount.text


async def test_owner_can_delete_expense(client, gym_a):
    headers = await _owner_headers(client)
    created = await client.post(
        "/api/v1/expenses",
        headers=headers,
        json={"category": "Salary", "amount_minor": 100000, "method": "cash"},
    )
    assert created.status_code == 201, created.text
    expense_id = created.json()["id"]

    deleted = await client.delete(f"/api/v1/expenses/{expense_id}", headers=headers)
    assert deleted.status_code == 204, deleted.text

    listing = await client.get("/api/v1/expenses", headers=headers)
    assert all(i["id"] != expense_id for i in listing.json()["items"])


async def test_owner_can_update_expense(client, gym_a):
    headers = await _owner_headers(client)
    created = await client.post(
        "/api/v1/expenses",
        headers=headers,
        json={
            "category": "Rent",
            "description": "original note",
            "amount_minor": 100000,
            "method": "cash",
        },
    )
    assert created.status_code == 201, created.text
    expense_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/expenses/{expense_id}",
        headers=headers,
        json={"category": "Utilities", "amount_minor": 150000, "method": "upi"},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["category"] == "Utilities"
    assert body["amount_minor"] == 150000
    assert body["method"] == "upi"
    # Unspecified fields stay untouched.
    assert body["description"] == "original note"

    bad_amount = await client.patch(
        f"/api/v1/expenses/{expense_id}",
        headers=headers,
        json={"amount_minor": 0},
    )
    assert bad_amount.status_code == 422, bad_amount.text

    # Tenant isolation: gym B cannot touch gym A's expense.
    other = await _owner_headers(client, "gymb")
    foreign = await client.patch(
        f"/api/v1/expenses/{expense_id}",
        headers=other,
        json={"amount_minor": 1},
    )
    assert foreign.status_code == 404, foreign.text

    missing = await client.patch(
        "/api/v1/expenses/00000000-0000-0000-0000-000000000000",
        headers=headers,
        json={"amount_minor": 1},
    )
    assert missing.status_code == 404, missing.text
