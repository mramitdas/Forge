"""Import records from the legacy GMS (Django/SQLite) database into Forge.

Maps the old single-gym Django schema onto Forge's multi-tenant models:
  app_gym          -> Gym + Branch (MAIN)
  app_customuser   -> owner/staff User accounts (members stay login-less)
  app_client       -> Member (branch MAIN, phone+demographics, emergency
                      contact stashed in custom_data.gms)
  app_membership   -> Subscription + Invoice + InvoiceLine + Payment
                      ("registration" rows import as one-off invoices)
  app_management
  app_trainer      -> staff users with mapped role templates
  app_expense      -> Expense (paid_at = created_at; online -> upi)
  app_measurement  -> NOT imported (no matching Forge model yet)

Django password hashes cannot be reused; imported staff/owner accounts get a
temporary password and `must_change=True`.

Run from backend/:
    python -m scripts.import_gms /path/to/db.sqlite3 [--password TEMP]
"""

from __future__ import annotations

import argparse
import asyncio
import sqlite3
import uuid
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import get_settings
from app.core.security import hash_password
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.billing.models import Invoice, InvoiceLine, Payment
from app.modules.billing.service import _next_invoice_number
from app.modules.expenses.models import Expense
from app.modules.identity.models import Credential, Role, User
from app.modules.identity.service import assign_role
from app.modules.members.models import Member
from app.modules.membership.models import Subscription
from app.modules.membership.service import create_plan
from app.modules.tenancy.models import Branch, Gym
from app.modules.tenancy.service import provision_gym
from sqlalchemy import select

GENDER_MAP = {"M": "Male", "F": "Female"}
METHOD_MAP = {"cash": "cash", "online": "upi"}
STAFF_ROLE_MAP = {"sub-owner": "Branch Manager", "staff": "Receptionist"}
NOW = datetime.now(UTC)


def _rows(db: sqlite3.Connection, sql: str) -> list[sqlite3.Row]:
    db.row_factory = sqlite3.Row
    return list(db.execute(sql))


def _dt(value: str | None, fallback: datetime | None = None) -> datetime:
    if value:
        return datetime.fromisoformat(str(value)).replace(tzinfo=UTC)
    return fallback or NOW


def _minor(fee) -> int:
    return round(float(fee or 0) * 100)


def _full_name(first: str | None, middle: str | None, last: str | None) -> str:
    return " ".join(p for p in (first, middle, last) if p)


def _months_between(start: datetime | None, end: datetime | None) -> int | None:
    if not start or not end:
        return None
    days = max((end - start).days, 1)
    return max(1, round(days / 30))


def _mode(values: list, default):
    values = [v for v in values if v is not None]
    return Counter(values).most_common(1)[0][0] if values else default


def _billing_period(months: int | None) -> str:
    return {1: "monthly", 3: "quarterly", 12: "annual"}.get(months or 1, "monthly")


def import_gms(sqlite_path: str, temp_password: str, slug: str) -> None:
    path = Path(sqlite_path)
    if not path.exists():
        raise SystemExit(f"sqlite file not found: {path}")

    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    gyms = _rows(db, "SELECT * FROM app_gym")
    users = {r["id"]: r for r in _rows(db, "SELECT * FROM app_customuser")}
    clients = _rows(db, "SELECT * FROM app_client")
    memberships = _rows(db, "SELECT * FROM app_membership")
    trainers = _rows(db, "SELECT * FROM app_trainer")
    managers = _rows(db, "SELECT * FROM app_management")
    expense_rows = _rows(db, "SELECT * FROM app_expense")
    measurements = _rows(db, "SELECT count(*) AS n FROM app_measurement")[0]["n"]

    if len(gyms) != 1:
        raise SystemExit(f"expected exactly 1 gym in the GMS dump, found {len(gyms)}")
    g = gyms[0]
    owner = users[g["owner_id"]]

    settings = get_settings()
    maker = get_sessionmaker()
    print(
        f"GMS: gym={g['name']!r} clients={len(clients)} memberships={len(memberships)} "
        f"managers={len(managers)} trainers={len(trainers)}"
    )

    # ── 1. Platform scope: refuse when the import target already exists ──

    async def _provision() -> uuid.UUID:
        ctx = TenantContext(
            tenant_id=uuid.UUID(settings.platform_tenant_id), platform_scope=True
        )
        token = set_tenant_context(ctx)
        try:
            async with maker() as session:
                await session.begin()
                dupe = await session.scalar(select(Gym.id).where(Gym.slug == slug))
                if dupe is not None:
                    raise SystemExit(
                        f"gym slug {slug!r} already exists — run `make reset` first "
                        "(imports are all-or-nothing)"
                    )
                gym = await provision_gym(
                    session,
                    name=g["name"],
                    slug=slug,
                    owner_email=owner["email"],
                    owner_name=_full_name(
                        owner["first_name"], owner["middle_name"], owner["last_name"]
                    ),
                    owner_password=temp_password,
                    tier_code="starter",
                    timezone="Asia/Kolkata",
                    currency="INR",
                )
                gym_id = gym.id
                await session.commit()
                print(f"provisioned gym {slug} ({gym_id}) with owner {owner['email']}")
                return gym_id
        finally:
            reset_tenant_context(token)

    async def _gym_scope(gym_id: uuid.UUID):
        return set_tenant_context(TenantContext(tenant_id=gym_id, platform_scope=False))

    async def run_gym_import(gym_id: uuid.UUID) -> None:
        token = await _gym_scope(gym_id)
        try:
            async with maker() as session:
                await session.begin()

                # ── 2. Branch (GMS had no branches; one MAIN per address) ──
                branch = Branch(
                    gym_id=gym_id,
                    name="Main Branch",
                    code="MAIN",
                    address=g["address"],
                    timezone="Asia/Kolkata",
                )
                session.add(branch)
                await session.flush()

                # ── 3. Plans from distinct membership types ──
                recurring = [m for m in memberships if m["membership_type"] != "registration"]
                types = sorted({m["membership_type"] for m in recurring})
                plan_ids: dict[str, uuid.UUID] = {}
                for mtype in types:
                    rows = [m for m in recurring if m["membership_type"] == mtype]
                    durations = [
                        _months_between(_dt(m["start_date"]), _dt(m["end_date"])) for m in rows
                    ]
                    months = _mode(durations, 1) or 1
                    amount = _mode([_minor(m["fee_amount"]) for m in rows], 0)
                    plan = await create_plan(
                        session,
                        tenant_id=gym_id,
                        name=mtype.title(),
                        slug=mtype,
                        description=f"Imported from GMS ({mtype})",
                        billing_period=_billing_period(months),
                        amount_minor=amount,
                        entry_fee_minor=0,
                        tax_rate_bp=1800,
                        duration_months=months,
                        auto_renew=False,
                    )
                    plan_ids[mtype] = plan.id
                    print(f"plan {mtype}: ₹{amount / 100:.0f}/{months}mo")

                # ── 4. Members from app_client ⨝ app_customuser ──
                member_ids: dict[int, uuid.UUID] = {}
                for c in clients:
                    u = users[c["user_id"]]
                    member = Member(
                        tenant_id=gym_id,
                        branch_id=branch.id,
                        first_name=u["first_name"] or "Member",
                        last_name=_full_name(None, u["middle_name"], u["last_name"]) or None,
                        email=u["email"] or None,
                        phone=u["phone_number"] or None,
                        country_code="+91" if u["phone_number"] else None,
                        gender=GENDER_MAP.get(u["gender"]),
                        status="active" if u["is_active"] else "cancelled",
                        is_active=bool(u["is_active"]),
                        joined_at=_dt(c["date_joined"], _dt(u["created_at"])),
                        custom_data={
                            "gms": {
                                "client_id": c["id"],
                                "user_id": u["id"],
                                "emergency_contact_name": c["emergency_contact_name"],
                                "emergency_contact_phone": c["emergency_contact_phone"],
                            }
                        },
                    )
                    session.add(member)
                    member_ids[c["id"]] = member
                await session.flush()
                print(f"imported {len(member_ids)} members")

                # ── 5. Memberships → subscriptions + invoices + payments ──
                client_by_id = {c["id"]: c for c in clients}
                inv_count = sub_count = pay_count = 0
                for m in memberships:
                    member = member_ids.get(m["client_id"])
                    if member is None:
                        continue
                    fee = _minor(m["fee_amount"])
                    pending = _minor(m["pending_amount"]) if m["pending_amount"] else 0
                    paid = (
                        fee - pending if pending else (fee if m["payment_status"] == "paid" else 0)
                    )
                    status = (
                        "paid" if paid >= fee and fee > 0 else "partial" if paid > 0 else "open"
                    )
                    client_user = users[client_by_id[m["client_id"]]["user_id"]]
                    start = _dt(m["start_date"], _dt(client_user["created_at"]))
                    end = _dt(m["end_date"]) if m["end_date"] else None
                    sub = None
                    if m["membership_type"] != "registration":
                        if end is not None and end < NOW:
                            sub_status = "expired"
                        elif m["payment_status"] == "pending":
                            sub_status = "pending"
                        else:
                            sub_status = "active"
                        sub = Subscription(
                            tenant_id=gym_id,
                            member_id=member.id,
                            plan_id=plan_ids[m["membership_type"]],
                            branch_id=branch.id,
                            status=sub_status,
                            start_at=start,
                            end_at=end,
                            auto_renew=False,
                            price_minor=fee,
                            currency="INR",
                        )
                        session.add(sub)
                        await session.flush()
                        sub_count += 1

                    invoice = Invoice(
                        tenant_id=gym_id,
                        number=await _next_invoice_number(session, gym_id, NOW),
                        member_id=member.id,
                        branch_id=branch.id,
                        subscription_id=sub.id if sub else None,
                        status=status,
                        issue_date=start,
                        due_date=start,
                        currency="INR",
                        subtotal_minor=fee,
                        tax_minor=0,
                        total_minor=fee,
                        paid_minor=paid,
                    )
                    session.add(invoice)
                    await session.flush()  # invoice.id needed by line/payment
                    session.add(
                        InvoiceLine(
                            invoice_id=invoice.id,
                            description=f"{m['membership_type'].title()} membership (GMS import)",
                            quantity=1,
                            unit_price_minor=fee,
                            tax_rate_bp=0,
                            amount_minor=fee,
                            kind="subscription" if sub else "entry_fee",
                        )
                    )
                    await session.flush()
                    inv_count += 1
                    if paid > 0:
                        session.add(
                            Payment(
                                tenant_id=gym_id,
                                invoice_id=invoice.id,
                                member_id=member.id,
                                amount_minor=paid,
                                currency="INR",
                                method=METHOD_MAP.get(m["payment_mode"] or "cash", "cash"),
                                status="succeeded",
                                gateway="legacy-gms",
                                gateway_ref=f"gms-membership-{m['id']}",
                                idempotency_key=f"gms-import-membership-{m['id']}",
                                raw={"gms_membership_id": m["id"]},
                                paid_at=start,
                            )
                        )
                        pay_count += 1
                print(
                    f"imported {sub_count} subscriptions, {inv_count} invoices, "
                    f"{pay_count} payments"
                )

                # ── 6. Staff: app_management + app_trainer → role templates ──
                staff_rows = [
                    (
                        managers,
                        lambda r: STAFF_ROLE_MAP.get(r["role"], "Receptionist"),
                        "management",
                    ),
                    (trainers, lambda r: "Trainer", "trainer"),
                ]
                created_staff = 0
                synthesized = []
                for rows, role_for, kind in staff_rows:
                    for r in rows:
                        u = users[r["user_id"]]
                        email = u["email"]
                        if not email:
                            email = f"legacy-{kind}-{u['id']}@{slug}.import"
                            synthesized.append(email)
                        existing = await session.scalar(select(User.id).where(User.email == email))
                        if existing is not None:
                            continue
                        role_name = role_for(r)
                        role_id = await session.scalar(
                            select(Role.id).where(
                                Role.tenant_id == gym_id,
                                Role.name == role_name,
                                Role.deleted_at.is_(None),
                            )
                        )
                        if role_id is None:
                            print(f"role {role_name!r} not found, skipping {email}")
                            continue
                        user = User(
                            tenant_id=gym_id,
                            email=email,
                            full_name=_full_name(u["first_name"], u["middle_name"], u["last_name"])
                            or email,
                            phone=u["phone_number"] or None,
                            is_active=bool(u["is_active"]),
                            is_platform=False,
                        )
                        user.credential = Credential(
                            password_hash=hash_password(temp_password), must_change=True
                        )
                        session.add(user)
                        await session.flush()
                        await assign_role(session, user_id=user.id, role_id=role_id)
                        created_staff += 1
                print(f"created {created_staff} staff accounts (temp password, must change)")
                if synthesized:
                    print("  synthesized emails for staff without one:")
                    for e in synthesized:
                        print(f"    - {e}")

                # ── 7. Expenses (GMS had a single gym; attach to MAIN branch) ──
                for e in expense_rows:
                    session.add(
                        Expense(
                            tenant_id=gym_id,
                            branch_id=branch.id,
                            category=e["category"],
                            description=e["description"] or None,
                            amount_minor=_minor(e["amount"]),
                            currency="INR",
                            method=METHOD_MAP.get(e["payment_method"] or "cash", "cash"),
                            paid_at=_dt(e["created_at"]),
                        )
                    )
                print(f"imported {len(expense_rows)} expenses")

                await session.commit()
        finally:
            reset_tenant_context(token)

    # One event loop for both phases: the async engine's pool is bound to the
    # loop that created it, so asyncio.run() may only be called once.
    async def _import_all() -> None:
        await run_gym_import(await _provision())

    asyncio.run(_import_all())

    print(
        "\nIMPORT COMPLETE\n"
        f"  gym:      {g['name']} ({slug})\n"
        f"  members:  {len(clients)}\n"
        f"  billing:  {len(memberships)} membership rows -> subscriptions/invoices\n"
        f"  expenses: {len(expense_rows)}\n"
        f"  skipped:  {measurements} measurements (no matching Forge model)\n"
        f"  staff/owner login password: {temp_password} (must change on first login)\n"
        f"  members have NO login (phone-only records, as in GMS)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sqlite_path", help="path to the legacy db.sqlite3")
    parser.add_argument(
        "--password", default="changeme-123", help="temp password for imported staff/owner"
    )
    parser.add_argument("--slug", default="evolve-gym", help="slug for the imported gym")
    args = parser.parse_args()
    import_gms(args.sqlite_path, args.password, args.slug)


if __name__ == "__main__":
    main()
