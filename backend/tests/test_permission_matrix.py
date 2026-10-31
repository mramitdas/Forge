from __future__ import annotations

from httpx import AsyncClient

from tests.helpers import login

_STRONG_PASSWORD = "Employee-Pass-123!"
_OWNER_EMAIL = "owner-gyma@example.com"
_OWNER_PASSWORD = "owner-pass-123"

_counter = 0


def _next(tag: str) -> str:
    global _counter
    _counter += 1
    return f"{tag}-{_counter}"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def make_employee(
    client: AsyncClient, gym_a: dict, permission_codes: list[str]
) -> tuple[dict[str, str], str, str, dict[str, str]]:
    """As the gym owner, create a role with ``permission_codes``, an employee
    holding it, log the employee in, and return ``(headers, role_id,
    employee_id, owner_headers)``. Callers delete the employee in ``try``/
    ``finally`` via ``DELETE /api/v1/employees/{employee_id}``."""
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])

    role = await client.post(
        "/api/v1/permissions/roles",
        headers=oheaders,
        json={
            "name": f"Matrix {_next('role')}",
            "permission_codes": list(permission_codes),
            "branch_scope": "all",
        },
    )
    assert role.status_code == 201, role.text
    role_id = role.json()["id"]

    email = f"matrix-{_next('emp')}@example.com"
    employee = await client.post(
        "/api/v1/employees",
        headers=oheaders,
        json={
            "email": email,
            "full_name": "Matrix Employee",
            "password": _STRONG_PASSWORD,
            "role_ids": [role_id],
        },
    )
    assert employee.status_code == 201, employee.text
    employee_id = employee.json()["id"]

    tokens = await login(client, email, _STRONG_PASSWORD)
    headers = _headers(tokens["access_token"])
    return headers, role_id, employee_id, oheaders


async def _owner_create_branch(client, oheaders: dict[str, str]) -> dict:
    response = await client.post(
        "/api/v1/branches",
        headers=oheaders,
        json={
            "name": f"Matrix Branch {_next('br')}",
            "code": f"MB{_next('br')}",
            "timezone": "Asia/Kolkata",
            "country_code": "+91",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _owner_create_plan(client, oheaders: dict[str, str]) -> dict:
    response = await client.post(
        "/api/v1/plans",
        headers=oheaders,
        json={
            "name": "Matrix Plan",
            "slug": f"matrix-plan-{_next('pl')}",
            "billing_period": "monthly",
            "amount_minor": 100000,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _owner_create_member(
    client, oheaders: dict[str, str], branch_id: str, plan_id: str
) -> dict:
    response = await client.post(
        "/api/v1/members",
        headers=oheaders,
        json={
            "first_name": "Matrix",
            "last_name": "Member",
            "email": f"matrix-member-{_next('mem')}@example.com",
            "phone": "9000000000",
            "country_code": "+91",
            "branch_id": branch_id,
            "plan_id": plan_id,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _owner_create_expense(client, oheaders: dict[str, str]) -> dict:
    response = await client.post(
        "/api/v1/expenses",
        headers=oheaders,
        json={
            "category": "Rent",
            "description": "Matrix rent",
            "amount_minor": 250000,
            "method": "upi",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _subscribe(
    client, oheaders: dict[str, str], member_id: str, plan_id: str, branch_id: str
) -> dict:
    response = await client.post(
        "/api/v1/plans/subscribe",
        headers=oheaders,
        json={"member_id": member_id, "plan_id": plan_id, "branch_id": branch_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _unpaid_invoice_id(client, oheaders: dict[str, str], member_id: str) -> str:
    response = await client.get(
        "/api/v1/invoices", headers=oheaders, params={"member_id": member_id}
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items, f"no invoice for member {member_id}"
    return items[0]["id"]


async def test_permission_matrix_members(client, gym_a):
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])
    branch = await _owner_create_branch(client, oheaders)
    plan = await _owner_create_plan(client, oheaders)
    member = await _owner_create_member(client, oheaders, branch["id"], plan["id"])

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["members.view"])
    try:
        read = await client.get("/api/v1/members", headers=headers)
        assert read.status_code == 200, read.text
        created = await client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": "No",
                "last_name": "Write",
                "email": f"view-member-{_next('mem')}@example.com",
                "branch_id": branch["id"],
                "plan_id": plan["id"],
            },
        )
        assert created.status_code == 403, created.text
        patched = await client.patch(
            f"/api/v1/members/{member['id']}",
            headers=headers,
            json={"is_active": False},
        )
        assert patched.status_code == 403, patched.text
        deleted = await client.delete(
            f"/api/v1/members/{member['id']}", headers=headers
        )
        assert deleted.status_code == 403, deleted.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["members.manage"])
    try:
        read = await client.get("/api/v1/members", headers=headers)
        assert read.status_code == 200, read.text  # manage implies view
        created = await client.post(
            "/api/v1/members",
            headers=headers,
            json={
                "first_name": "Emp",
                "last_name": "Member",
                "email": f"manage-member-{_next('mem')}@example.com",
                "branch_id": branch["id"],
                "plan_id": plan["id"],
            },
        )
        assert created.status_code == 201, created.text
        new_id = created.json()["id"]
        patched = await client.patch(
            f"/api/v1/members/{new_id}", headers=headers, json={"is_active": False}
        )
        assert patched.status_code == 200, patched.text
        deleted = await client.delete(
            f"/api/v1/members/{new_id}", headers=headers
        )
        assert deleted.status_code == 204, deleted.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)


async def test_permission_matrix_membership(client, gym_a):
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])
    branch = await _owner_create_branch(client, oheaders)
    plan = await _owner_create_plan(client, oheaders)
    member = await _owner_create_member(client, oheaders, branch["id"], plan["id"])
    pending = await _subscribe(
        client, oheaders, member["id"], plan["id"], branch["id"]
    )

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["membership.view"])
    try:
        plans = await client.get("/api/v1/plans", headers=headers)
        assert plans.status_code == 200, plans.text
        subs = await client.get(
            "/api/v1/plans/subscriptions",
            headers=headers,
            params={"member_id": member["id"]},
        )
        assert subs.status_code == 200, subs.text
        created = await client.post(
            "/api/v1/plans",
            headers=headers,
            json={
                "name": "No Write Plan",
                "slug": f"view-plan-{_next('pl')}",
                "billing_period": "monthly",
                "amount_minor": 100000,
            },
        )
        assert created.status_code == 403, created.text
        activated = await client.post(
            f"/api/v1/plans/subscriptions/{pending['id']}/activate",
            headers=headers,
        )
        assert activated.status_code == 403, activated.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["membership.manage"])
    try:
        plans = await client.get("/api/v1/plans", headers=headers)
        assert plans.status_code == 200, plans.text  # manage implies view
        subs = await client.get(
            "/api/v1/plans/subscriptions",
            headers=headers,
            params={"member_id": member["id"]},
        )
        assert subs.status_code == 200, subs.text
        created = await client.post(
            "/api/v1/plans",
            headers=headers,
            json={
                "name": "Manage Plan",
                "slug": f"manage-plan-{_next('pl')}",
                "billing_period": "monthly",
                "amount_minor": 100000,
            },
        )
        assert created.status_code == 201, created.text
        activated = await client.post(
            f"/api/v1/plans/subscriptions/{pending['id']}/activate",
            headers=headers,
        )
        assert activated.status_code == 200, activated.text
        assert activated.json()["status"] == "active"
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)


async def test_permission_matrix_billing(client, gym_a):
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])
    branch = await _owner_create_branch(client, oheaders)
    plan = await _owner_create_plan(client, oheaders)
    member_a = await _owner_create_member(client, oheaders, branch["id"], plan["id"])
    member_b = await _owner_create_member(client, oheaders, branch["id"], plan["id"])
    invoice_a = await _unpaid_invoice_id(client, oheaders, member_a["id"])
    invoice_b = await _unpaid_invoice_id(client, oheaders, member_b["id"])

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["billing.view"])
    try:
        invoices = await client.get("/api/v1/invoices", headers=headers)
        assert invoices.status_code == 200, invoices.text
        summary = await client.get("/api/v1/invoices/summary", headers=headers)
        assert summary.status_code == 200, summary.text
        paid = await client.post(
            f"/api/v1/invoices/{invoice_a}/pay",
            headers=headers,
            json={"method": "upi", "idempotency_key": f"idem-view-{_next('idem')}"},
        )
        assert paid.status_code == 403, paid.text
        voided = await client.post(
            f"/api/v1/invoices/{invoice_b}/void", headers=headers
        )
        assert voided.status_code == 403, voided.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["billing.manage"])
    try:
        invoices = await client.get("/api/v1/invoices", headers=headers)
        assert invoices.status_code == 200, invoices.text  # manage implies view
        summary = await client.get("/api/v1/invoices/summary", headers=headers)
        assert summary.status_code == 200, summary.text
        paid = await client.post(
            f"/api/v1/invoices/{invoice_a}/pay",
            headers=headers,
            json={"method": "upi", "idempotency_key": f"idem-manage-{_next('idem')}"},
        )
        assert paid.status_code == 200, paid.text
        voided = await client.post(
            f"/api/v1/invoices/{invoice_b}/void", headers=headers
        )
        assert voided.status_code == 200, voided.text
        assert voided.json()["status"] == "void"
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)


async def test_permission_matrix_expenses(client, gym_a):
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])
    expense = await _owner_create_expense(client, oheaders)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["expenses.view"])
    try:
        listing = await client.get("/api/v1/expenses", headers=headers)
        assert listing.status_code == 200, listing.text
        created = await client.post(
            "/api/v1/expenses",
            headers=headers,
            json={
                "category": "No Write",
                "amount_minor": 100,
                "method": "cash",
            },
        )
        assert created.status_code == 403, created.text
        patched = await client.patch(
            f"/api/v1/expenses/{expense['id']}",
            headers=headers,
            json={"category": "Hijack"},
        )
        assert patched.status_code == 403, patched.text
        deleted = await client.delete(
            f"/api/v1/expenses/{expense['id']}", headers=headers
        )
        assert deleted.status_code == 403, deleted.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["expenses.manage"])
    try:
        listing = await client.get("/api/v1/expenses", headers=headers)
        assert listing.status_code == 200, listing.text  # manage implies view
        created = await client.post(
            "/api/v1/expenses",
            headers=headers,
            json={
                "category": "Salary",
                "amount_minor": 100000,
                "method": "cash",
            },
        )
        assert created.status_code == 201, created.text
        new_id = created.json()["id"]
        patched = await client.patch(
            f"/api/v1/expenses/{new_id}",
            headers=headers,
            json={"category": "Utilities", "amount_minor": 150000},
        )
        assert patched.status_code == 200, patched.text
        deleted = await client.delete(
            f"/api/v1/expenses/{new_id}", headers=headers
        )
        assert deleted.status_code == 204, deleted.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)


async def test_permission_matrix_attendance(client, gym_a):
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])
    branch = await _owner_create_branch(client, oheaders)
    plan = await _owner_create_plan(client, oheaders)
    member = await _owner_create_member(client, oheaders, branch["id"], plan["id"])

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["attendance.view"])
    try:
        read = await client.get("/api/v1/checkin", headers=headers)
        assert read.status_code == 200, read.text
        created = await client.post(
            "/api/v1/checkin",
            headers=headers,
            json={
                "member_id": member["id"],
                "branch_id": branch["id"],
                "source": "manual",
            },
        )
        assert created.status_code == 403, created.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["attendance.manage"])
    try:
        read = await client.get("/api/v1/checkin", headers=headers)
        assert read.status_code == 200, read.text  # manage implies view
        created = await client.post(
            "/api/v1/checkin",
            headers=headers,
            json={
                "member_id": member["id"],
                "branch_id": branch["id"],
                "source": "manual",
            },
        )
        assert created.status_code == 201, created.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)


async def test_permission_matrix_tenancy(client, gym_a):
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])
    target = await _owner_create_branch(client, oheaders)
    original_settings = (
        await client.get("/api/v1/settings", headers=oheaders)
    ).json()

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["tenancy.view"])
    try:
        branches = await client.get("/api/v1/branches", headers=headers)
        assert branches.status_code == 200, branches.text
        settings = await client.get("/api/v1/settings", headers=headers)
        assert settings.status_code == 403, settings.text  # settings GET needs manage
        created = await client.post(
            "/api/v1/branches",
            headers=headers,
            json={
                "name": "No Write Branch",
                "code": f"NWB{_next('br')}",
                "timezone": "Asia/Kolkata",
                "country_code": "+91",
            },
        )
        assert created.status_code == 403, created.text
        patched = await client.patch(
            f"/api/v1/branches/{target['id']}",
            headers=headers,
            json={"name": "Hijack"},
        )
        assert patched.status_code == 403, patched.text
        deleted = await client.delete(
            f"/api/v1/branches/{target['id']}", headers=headers
        )
        assert deleted.status_code == 403, deleted.text
        psettings = await client.patch(
            "/api/v1/settings", headers=headers, json={"name": "Hijack"}
        )
        assert psettings.status_code == 403, psettings.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["tenancy.manage"])
    try:
        branches = await client.get("/api/v1/branches", headers=headers)
        assert branches.status_code == 200, branches.text  # manage implies view
        settings = await client.get("/api/v1/settings", headers=headers)
        assert settings.status_code == 200, settings.text
        created = await client.post(
            "/api/v1/branches",
            headers=headers,
            json={
                "name": "Manage Branch",
                "code": f"MGB{_next('br')}",
                "timezone": "Asia/Kolkata",
                "country_code": "+91",
            },
        )
        assert created.status_code == 201, created.text
        new_id = created.json()["id"]
        patched = await client.patch(
            f"/api/v1/branches/{new_id}",
            headers=headers,
            json={"name": "Manage Branch Renamed"},
        )
        assert patched.status_code == 200, patched.text
        assert patched.json()["name"] == "Manage Branch Renamed"
        deleted = await client.delete(
            f"/api/v1/branches/{new_id}", headers=headers
        )
        assert deleted.status_code == 204, deleted.text
        psettings = await client.patch(
            "/api/v1/settings",
            headers=headers,
            json={"timezone": "Europe/Berlin"},
        )
        assert psettings.status_code == 200, psettings.text
    finally:
        await client.patch(
            "/api/v1/settings", headers=o, json=original_settings
        )
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)


async def test_permission_matrix_notifications(client, gym_a):

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["notifications.view"])
    try:
        read = await client.get("/api/v1/notifications", headers=headers)
        assert read.status_code == 200, read.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    # notifications.manage was retired: creating a role with it must 422.
    owner = await login(client, _OWNER_EMAIL, _OWNER_PASSWORD)
    oheaders = _headers(owner["access_token"])
    dead_role = await client.post(
        "/api/v1/permissions/roles",
        headers=oheaders,
        json={
            "name": f"Matrix {_next('role')}",
            "permission_codes": ["notifications.manage"],
            "branch_scope": "all",
        },
    )
    assert dead_role.status_code == 422, dead_role.text


async def test_permission_matrix_identity(client, gym_a):

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["identity.view"])
    try:
        read = await client.get("/api/v1/employees", headers=headers)
        assert read.status_code == 200, read.text
        created_role = await client.post(
            "/api/v1/permissions/roles",
            headers=headers,
            json={
                "name": f"No Role {_next('role')}",
                "permission_codes": ["identity.view"],
                "branch_scope": "all",
            },
        )
        assert created_role.status_code == 403, created_role.text
        created_emp = await client.post(
            "/api/v1/employees",
            headers=headers,
            json={
                "email": f"view-emp-{_next('emp')}@example.com",
                "full_name": "No Write",
                "password": _STRONG_PASSWORD,
                "role_ids": [],
            },
        )
        assert created_emp.status_code == 403, created_emp.text
        roles = await client.get("/api/v1/permissions/roles", headers=headers)
        assert roles.status_code == 403, roles.text
    finally:
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)

    headers, _role_id, emp_id, o = await make_employee(client, gym_a, ["identity.manage"])
    nested_emp_id: str | None = None
    try:
        read = await client.get("/api/v1/employees", headers=headers)
        assert read.status_code == 200, read.text  # manage implies view
        created_role = await client.post(
            "/api/v1/permissions/roles",
            headers=headers,
            json={
                "name": f"Manage Role {_next('role')}",
                "permission_codes": ["identity.manage"],
                "branch_scope": "all",
            },
        )
        assert created_role.status_code == 201, created_role.text
        role_id = created_role.json()["id"]
        created_emp = await client.post(
            "/api/v1/employees",
            headers=headers,
            json={
                "email": f"manage-emp-{_next('emp')}@example.com",
                "full_name": "Manage",
                "password": _STRONG_PASSWORD,
                "role_ids": [role_id],
            },
        )
        assert created_emp.status_code == 201, created_emp.text
        nested_emp_id = created_emp.json()["id"]
        roles = await client.get("/api/v1/permissions/roles", headers=headers)
        assert roles.status_code == 200, roles.text
    finally:
        if nested_emp_id is not None:
            await client.delete(f"/api/v1/employees/{nested_emp_id}", headers=o)
        await client.delete(f"/api/v1/employees/{emp_id}", headers=o)
