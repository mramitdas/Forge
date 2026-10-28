from __future__ import annotations

import uuid

from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.identity.models import User
from app.modules.notifications.service import create_notification
from sqlalchemy import select

from tests.helpers import login, provision_gym


async def _owner_headers(client, platform_token, slug: str) -> tuple[dict, dict]:
    gym = await provision_gym(client, platform_token, slug)
    tokens = await login(client, f"owner-{slug}@example.com", "owner-pass-123")
    return {"Authorization": f"Bearer {tokens['access_token']}"}, gym


def _assert_page_shape(body: dict) -> None:
    assert set(body) >= {"items", "total", "page", "page_size"}


async def test_members_page_size_cap_1000(client, platform_token):
    headers, _gym = await _owner_headers(client, platform_token, "pgmembers")
    res = await client.get(
        "/api/v1/members", headers=headers, params={"page_size": 1001}
    )
    assert res.status_code == 422, res.text
    res = await client.get(
        "/api/v1/members", headers=headers, params={"page_size": 1000}
    )
    assert res.status_code == 200, res.text
    _assert_page_shape(res.json())
    assert res.json()["page_size"] == 1000


async def test_invoices_page_size_cap_1000(client, platform_token):
    headers, _gym = await _owner_headers(client, platform_token, "pginvoices")
    res = await client.get(
        "/api/v1/invoices", headers=headers, params={"page_size": 1001}
    )
    assert res.status_code == 422, res.text
    res = await client.get(
        "/api/v1/invoices", headers=headers, params={"page_size": 1000}
    )
    assert res.status_code == 200, res.text
    _assert_page_shape(res.json())
    assert res.json()["page_size"] == 1000


async def test_checkin_page_size_cap_1000_default_20(client, platform_token):
    headers, _gym = await _owner_headers(client, platform_token, "pgcheckins")
    res = await client.get(
        "/api/v1/checkin", headers=headers, params={"page_size": 1001}
    )
    assert res.status_code == 422, res.text
    res = await client.get(
        "/api/v1/checkin", headers=headers, params={"page_size": 1000}
    )
    assert res.status_code == 200, res.text
    _assert_page_shape(res.json())
    assert res.json()["page_size"] == 1000
    res = await client.get("/api/v1/checkin", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["page_size"] == 20  # pre-existing default, unchanged


async def _seed_subscription(client, headers: dict, slug: str) -> dict:
    plan = await client.post(
        "/api/v1/plans",
        headers=headers,
        json={
            "name": f"Paged Plan {slug}",
            "slug": f"paged-plan-{slug}",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    branch = await client.post(
        "/api/v1/branches", headers=headers, json={"name": f"Branch {slug}"}
    )
    assert branch.status_code == 201, branch.text
    member = await client.post(
        "/api/v1/members",
        headers=headers,
        json={
            "first_name": "Page",
            "last_name": "Tester",
            "email": f"page-{slug}@example.com",
            "gender": "Male",
            "status": "active",
            "branch_id": branch.json()["id"],
            "plan_id": plan.json()["id"],
        },
    )
    assert member.status_code == 201, member.text
    return member.json()["id"]


async def test_subscriptions_paged_shape_and_math(client, platform_token):
    headers, _gym = await _owner_headers(client, platform_token, "pgsubs")
    member_ids = [
        await _seed_subscription(client, headers, "a"),
        await _seed_subscription(client, headers, "b"),
    ]

    res = await client.get("/api/v1/plans/subscriptions", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    _assert_page_shape(body)
    assert body["page"] == 1
    assert body["page_size"] == 50  # binding default
    assert body["total"] >= 2
    ids_page = [s["member_id"] for s in body["items"]]
    assert all(str(mid) in ids_page for mid in member_ids)

    res = await client.get(
        "/api/v1/plans/subscriptions", headers=headers, params={"page_size": 1001}
    )
    assert res.status_code == 422, res.text

    first = await client.get(
        "/api/v1/plans/subscriptions", headers=headers, params={"page_size": 1}
    )
    assert first.status_code == 200, first.text
    assert len(first.json()["items"]) == 1
    second = await client.get(
        "/api/v1/plans/subscriptions",
        headers=headers,
        params={"page": 2, "page_size": 1},
    )
    assert second.status_code == 200, second.text
    assert second.json()["page"] == 2
    assert second.json()["total"] == first.json()["total"]
    assert (
        first.json()["items"][0]["id"] != second.json()["items"][0]["id"]
    ), "pages must not repeat rows"


async def test_subscriptions_member_filter_composes_with_pagination(
    client, platform_token
):
    headers, _gym = await _owner_headers(client, platform_token, "pgsubsf")
    member_id = await _seed_subscription(client, headers, "c")
    res = await client.get(
        "/api/v1/plans/subscriptions",
        headers=headers,
        params={"member_id": member_id, "page": 1, "page_size": 1},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] >= 1
    assert body["page_size"] == 1
    assert all(s["member_id"] == member_id for s in body["items"])


async def test_employees_paged_shape_and_math(client, platform_token):
    headers, _gym = await _owner_headers(client, platform_token, "pgemps")
    for i in range(2):
        created = await client.post(
            "/api/v1/employees",
            headers=headers,
            json={
                "email": f"pg-emp-{i}-{uuid.uuid4().hex[:6]}@example.com",
                "full_name": f"Page Employee {i}",
                "password": "staff-Pass-123!",
                "role_ids": [],
            },
        )
        assert created.status_code == 201, created.text

    res = await client.get("/api/v1/employees", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    _assert_page_shape(body)
    assert body["page"] == 1
    assert body["page_size"] == 50  # binding default
    assert body["total"] >= 2
    assert len(body["items"]) == body["total"]

    res = await client.get(
        "/api/v1/employees", headers=headers, params={"page_size": 1001}
    )
    assert res.status_code == 422, res.text

    first = await client.get(
        "/api/v1/employees", headers=headers, params={"page_size": 1, "page": 1}
    )
    assert first.status_code == 200, first.text
    assert len(first.json()["items"]) == 1
    second = await client.get(
        "/api/v1/employees", headers=headers, params={"page_size": 1, "page": 2}
    )
    assert second.status_code == 200, second.text
    assert (
        first.json()["items"][0]["id"] != second.json()["items"][0]["id"]
    ), "pages must not repeat rows"


async def test_subscriptions_status_filter_before_pagination(
    client, platform_token
):
    headers, _gym = await _owner_headers(client, platform_token, "pgsubsstat")
    plan = await client.post(
        "/api/v1/plans",
        headers=headers,
        json={
            "name": "Status Plan pgsubsstat",
            "slug": "status-plan-pgsubsstat",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert plan.status_code == 201, plan.text
    plan_id = plan.json()["id"]
    branch = await client.post(
        "/api/v1/branches", headers=headers, json={"name": "Branch pgsubsstat"}
    )
    assert branch.status_code == 201, branch.text
    branch_id = branch.json()["id"]
    member_ids: list[dict] = []
    for i in range(2):
        m = await client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": "Status",
                "last_name": f"Tester{i}",
                "email": f"status-{i}-pgsubsstat@example.com",
                "gender": "Male",
                "status": "active",
                "branch_id": branch_id,
                "plan_id": plan_id,
            },
        )
        assert m.status_code == 201, m.text
        member_ids.append(m.json()["id"])

    res = await client.get(
        "/api/v1/plans/subscriptions", headers=headers, params={"page_size": 1000}
    )
    assert res.status_code == 200, res.text
    all_total = res.json()["total"]
    assert all_total == 2
    existing_status = res.json()["items"][0]["status"]

    # one explicit fresh pending subscription (queued behind the existing term)
    pending_sub = await client.post(
        "/api/v1/plans/subscribe",
        headers=headers,
        json={
            "member_id": member_ids[0],
            "plan_id": plan_id,
            "branch_id": branch_id,
            "start_at": "2031-01-01T00:00:00Z",
        },
    )
    assert pending_sub.status_code == 201, pending_sub.text
    assert pending_sub.json()["status"] == "pending"

    res = await client.get(
        "/api/v1/plans/subscriptions", headers=headers, params={"page_size": 1000}
    )
    assert res.json()["total"] == 3, res.text

    pending = await client.get(
        "/api/v1/plans/subscriptions",
        headers=headers,
        params={"status": "pending", "page_size": 1000},
    )
    assert pending.status_code == 200, pending.text
    assert pending.json()["total"] == 1
    assert pending.json()["items"][0]["id"] == pending_sub.json()["id"]

    if existing_status == "active":
        active = await client.get(
            "/api/v1/plans/subscriptions",
            headers=headers,
            params={"status": "active", "page_size": 1000},
        )
        assert active.status_code == 200, active.text
        assert active.json()["total"] == 2
        assert all(s["status"] == "active" for s in active.json()["items"])
    else:
        assert existing_status in {"cancelled", "frozen", "expired"}
        other = await client.get(
            "/api/v1/plans/subscriptions",
            headers=headers,
            params={"status": existing_status, "page_size": 1000},
        )
        assert other.json()["total"] == 2

    # filtered total survives pagination
    page1 = await client.get(
        "/api/v1/plans/subscriptions",
        headers=headers,
        params={"status": pending_sub.json()["status"], "page": 1, "page_size": 1},
    )
    assert page1.status_code == 200, page1.text
    assert page1.json()["total"] == 1
    assert page1.json()["items"][0]["id"] == pending_sub.json()["id"]

    res = await client.get(
        "/api/v1/plans/subscriptions",
        headers=headers,
        params={"status": "nonsense"},
    )
    assert res.status_code == 422, res.text


async def test_employees_search_before_pagination(client, platform_token):
    headers, _gym = await _owner_headers(client, platform_token, "pgempsrch")
    names = ["Anna Marke", "Anna Rivera", "Bob Crest"]
    emails: list[str] = []
    for i, name in enumerate(names):
        email = f"pg-search-{i}-{uuid.uuid4().hex[:6]}@example.com"
        emails.append(email)
        created = await client.post(
            "/api/v1/employees",
            headers=headers,
            json={
                "email": email,
                "full_name": name,
                "password": "staff-Pass-123!",
                "role_ids": [],
            },
        )
        assert created.status_code == 201, created.text

    base = await client.get("/api/v1/employees", headers=headers)
    assert base.status_code == 200, base.text
    base_total = base.json()["total"]
    assert base_total == 3

    found = await client.get(
        "/api/v1/employees", headers=headers, params={"search": "Anna"}
    )
    assert found.status_code == 200, found.text
    assert found.json()["total"] == 2
    assert all("Anna" in e["full_name"] for e in found.json()["items"])

    # search composes with pagination
    paged = await client.get(
        "/api/v1/employees",
        headers=headers,
        params={"search": "Anna", "page": 1, "page_size": 1},
    )
    assert paged.status_code == 200, paged.text
    assert paged.json()["total"] == 2
    assert len(paged.json()["items"]) == 1
    page2 = await client.get(
        "/api/v1/employees",
        headers=headers,
        params={"search": "Anna", "page": 2, "page_size": 1},
    )
    assert page2.status_code == 200, page2.text
    assert page2.json()["total"] == 2
    assert page2.json()["items"][0]["id"] != paged.json()["items"][0]["id"]

    # email match
    email_hit = await client.get(
        "/api/v1/employees", headers=headers, params={"search": emails[2]}
    )
    assert email_hit.status_code == 200, email_hit.text
    assert email_hit.json()["total"] == 1
    assert email_hit.json()["items"][0]["email"] == emails[2]

    miss = await client.get(
        "/api/v1/employees", headers=headers, params={"search": "zzz-nomatch"}
    )
    assert miss.status_code == 200, miss.text
    assert miss.json()["total"] == 0


async def test_notifications_paged_shape_and_math(client, platform_token):
    headers, gym = await _owner_headers(client, platform_token, "pgnotes")
    owner_email = "owner-pgnotes@example.com"
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=uuid.UUID(str(gym["id"]))))
    try:
        async with maker() as session:
            await session.begin()
            owner_id = await session.scalar(
                select(User.id).where(User.email == owner_email)
            )
            for i in range(3):
                await create_notification(
                    session,
                    user_id=owner_id,
                    title=f"Page Note {i}",
                    body="x",
                    type="info",
                )
            await session.commit()
    finally:
        reset_tenant_context(token_ctx)

    res = await client.get("/api/v1/notifications", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    _assert_page_shape(body)
    assert body["page"] == 1
    assert body["page_size"] == 50  # binding default
    assert body["total"] >= 3

    res = await client.get(
        "/api/v1/notifications", headers=headers, params={"page_size": 1001}
    )
    assert res.status_code == 422, res.text

    first = await client.get(
        "/api/v1/notifications", headers=headers, params={"page_size": 2}
    )
    assert first.status_code == 200, first.text
    assert len(first.json()["items"]) == 2
    second = await client.get(
        "/api/v1/notifications",
        headers=headers,
        params={"page": 2, "page_size": 2},
    )
    assert second.status_code == 200, second.text
    assert (
        {n["id"] for n in first.json()["items"]}
        & {n["id"] for n in second.json()["items"]}
    ) == set(), "no overlap between pages"

    unread = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert unread.status_code == 200, unread.text
    assert unread.json()["count"] >= 3


async def test_expenses_year_pagination(client, platform_token):
    headers, _gym = await _owner_headers(client, platform_token, "pgexp")
    year = 2026
    for i in range(2):
        created = await client.post(
            "/api/v1/expenses",
            headers=headers,
            json={
                "category": "Rent",
                "amount_minor": 10000 + i,
                "method": "cash",
                "paid_at": f"{year}-01-1{i}T09:00:00Z",
            },
        )
        assert created.status_code == 201, created.text

    res = await client.get(
        "/api/v1/expenses", headers=headers, params={"year": year}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # Year contract stays: monthly breakdown + money total + rows.
    assert set(body) >= {"monthly", "total", "expenses", "page", "page_size"}
    assert len(body["expenses"]) >= 2
    money_total = body["total"]

    res = await client.get(
        "/api/v1/expenses", headers=headers, params={"page_size": 1001}
    )
    assert res.status_code == 422, res.text

    res = await client.get(
        "/api/v1/expenses",
        headers=headers,
        params={"year": year, "page": 1, "page_size": 1},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["expenses"]) == 1
    assert body["page"] == 1
    assert body["page_size"] == 1
    assert body["total"] == money_total, "year money total must ignore paging"
    assert body["monthly"] == {
        k: v for k, v in body["monthly"].items() if v
    }, "monthly breakdown must ignore paging"
