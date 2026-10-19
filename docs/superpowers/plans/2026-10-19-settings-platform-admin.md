# Settings Redesign (Platform Admins) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Platform admins get a Settings page with First/Last name (frozen email), a password section with live strength checklist, and no role/permissions sections; gym users' page stays byte-for-byte identical.

**Architecture:** Split `users.full_name` into `first_name`/`last_name` columns (full_name kept in sync). `PATCH /auth/me` accepts the split names and rejects email changes for platform actors (`403 EMAIL_FROZEN`). `POST /auth/change-password` enforces complexity (`422 PASSWORD_TOO_WEAK` + failed rules). Frontend: settings page becomes a dispatcher → `PlatformSettings` (new) or `GymSettings` (verbatim move of today's page). Strength rules mirrored in a pure `passwordChecks()` util.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + Pydantic; Next.js App Router + TanStack Query; node:test; Playwright e2e scripts.

**Spec:** `docs/superpowers/specs/2026-10-19-settings-platform-admin-design.md`

**Ground rules (from session context):**
- Dev servers on :8000/:3000 are RUNNING — do not restart them. Uvicorn `--reload` picks up backend changes; Next dev hot-reloads frontend.
- Stage specific paths, never `git add -A`. Direct commits to `main`.
- Backend gates: `cd backend && .venv/bin/python -m pytest` and `.venv/bin/ruff check app tests scripts`.
- FE gates: `cd apps/web && npx tsc --noEmit` and `npm test`.
- E2E: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/<name>_verify.cjs` (sequential).
- Platform gate is mandatory after touching `src/lib/hooks.ts`, `components/ui.tsx`, or `(app)/layout.tsx` (AGENTS.md frozen-surface rule).
- Error envelope: `{"error": {code, message, details, ...}}` — assert `resp.json()["error"]["code"]`.
- Shared-fixture tests: never leave `gym_a` owner (`owner-gyma@example.com` / `owner-pass-123`) with a changed password; the API can no longer set a weak password, so restore via direct DB (pattern: `_set_must_change` in `tests/test_auth.py:277`).

---

### Task 1: Backend — `first_name`/`last_name` columns + migration

**Files:**
- Modify: `backend/app/modules/identity/models.py` (User class ~44-74)
- Create: `backend/alembic/versions/0016_users_first_last_name.py`
- Modify: `backend/app/modules/tenancy/service.py:83` (provision owner User construction)
- Modify: `backend/app/modules/identity/service.py:426` (create employee User construction)

- [ ] **Step 1: Add columns + split helper to the model**

In `backend/app/modules/identity/models.py`, inside `class User`, after the `full_name` line (64), add:

```python
    first_name: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
    last_name: Mapped[str] = mapped_column(String(100), nullable=False, default="", server_default="")
```

At the bottom of the same file (after the last class), add:

```python
def split_full_name(full_name: str) -> tuple[str, str]:
    """Split a display name into (first, last). Single-word → last is ""."""
    parts = full_name.strip().split(maxsplit=1)
    if not parts:
        return "", ""
    return parts[0], parts[1] if len(parts) > 1 else ""
```

- [ ] **Step 2: Write the migration**

Create `backend/alembic/versions/0016_users_first_last_name.py`:

```python
"""users first_name / last_name columns

Split the single full_name column into first_name + last_name (members
module pattern). full_name stays as the denormalized display column,
recomputed by the app on every name write. Existing rows are backfilled
by splitting on the first space; single-word names land entirely in
first_name.

Revision ID: 0016_users_first_last_name
Revises: 0015_users_email_global_unique
Create Date: 2026-10-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_users_first_last_name"
down_revision = "0015_users_email_global_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("first_name", sa.String(100), nullable=False, server_default=""),
    )
    op.add_column(
        "users",
        sa.Column("last_name", sa.String(100), nullable=False, server_default=""),
    )
    op.execute(
        """
        UPDATE users SET
          first_name = split_part(full_name, ' ', 1),
          last_name = CASE
            WHEN position(' ' IN full_name) > 0
            THEN substring(full_name FROM position(' ' IN full_name) + 1)
            ELSE ''
          END
        """
    )


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
```

- [ ] **Step 3: Set the split columns at user-creation sites**

`backend/app/modules/tenancy/service.py` — in `provision_gym`'s User construction (around line 80-86). First add the import near the top (next to the existing identity-models import):

```python
from app.modules.identity.models import split_full_name
```

(If `split_full_name` is already importable via the existing `from app.modules.identity.models import User` line, extend that import instead.)

Then change the construction to:

```python
        owner_first, owner_last = split_full_name(owner_name)
        owner = User(
            tenant_id=tenant.id,
            email=owner_email.lower(),
            full_name=owner_name,
            first_name=owner_first,
            last_name=owner_last,
            is_active=True,
            is_platform=False,
        )
```

(Keep any other kwargs the current construction passes — only ADD the two split values. Read the surrounding block first; the exact existing kwargs win.)

`backend/app/modules/identity/service.py` — in `create_employee`'s User construction (around line 422-430). Extend the identity-models import (service.py already imports `User` from `.models`) to include `split_full_name`, then:

```python
        first, last = split_full_name(full_name)
        user = User(
            tenant_id=tenant_id,
            email=email.lower(),
            full_name=full_name,
            first_name=first,
            last_name=last,
            is_active=True,
            is_platform=False,
        )
```

(Again: read first, only add the split values to the existing construction.)

- [ ] **Step 4: Apply the migration to the dev DB**

Run: `cd backend && .venv/bin/alembic upgrade head`
Expected: no error; migration `0016_users_first_last_name` applied.

Verify backfill:

```bash
psql -h 127.0.0.1 -U amit -d gym_erp -c "SELECT email, full_name, first_name, last_name FROM users WHERE deleted_at IS NULL LIMIT 8;"
```
Expected: every row has first_name/last_name filled (e.g. `Platform Admin` → `Platform` / `Admin`).

- [ ] **Step 5: Run backend gates**

Run: `cd backend && .venv/bin/python -m pytest && .venv/bin/ruff check app tests scripts`
Expected: all previously passing tests still pass; ruff clean. (No new tests in this task — columns are additive.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/identity/models.py backend/alembic/versions/0016_users_first_last_name.py backend/app/modules/tenancy/service.py backend/app/modules/identity/service.py
git commit -m "feat(identity): users.first_name/last_name columns with backfill"
```

---

### Task 2: Backend — password complexity enforcement (TDD)

**Files:**
- Modify: `backend/app/core/security.py`
- Modify: `backend/app/modules/identity/schemas.py:22-24` (`ChangePasswordRequest`)
- Modify: `backend/app/modules/identity/service.py:228-256` (`change_password`)
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing tests**

Add a restore helper next to `_set_must_change` in `backend/tests/test_auth.py` (it needs `hash_password` — add `from app.core.security import hash_password` to the file's imports if not present):

```python
async def _restore_password(email: str, password: str) -> None:
    """Direct-DB reset of a shared-fixture password (the API rejects weak
    passwords now, so tests can't round-trip back to owner-pass-123)."""
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    async with maker() as session:
        await session.begin()
        user_id = await session.scalar(select(User.id).where(User.email == email))
        cred = await session.scalar(select(Credential).where(Credential.user_id == user_id))
        cred.password_hash = hash_password(password)
        cred.must_change = False
        await session.commit()
    reset_tenant_context(token_ctx)
```

Append at the end of `backend/tests/test_auth.py`:

```python
async def test_change_password_rejects_weak_new(client, gym_a):
    token = await _set_must_change(client, flag=False)
    weak_samples = [
        ("alllowercase1!", ["uppercase"]),
        ("ALLUPPERCASE1!", ["lowercase"]),
        ("NoDigits!!xx", ["digit"]),
        ("NoSpecial123", ["special"]),
        ("Ab1!", ["length"]),
        ("owner-pass-123", ["uppercase"]),
    ]
    for weak, expected_failed in weak_samples:
        res = await client.post(
            "/api/v1/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "owner-pass-123", "new_password": weak},
        )
        assert res.status_code == 422, (weak, res.text)
        body = res.json()["error"]
        assert body["code"] == "PASSWORD_TOO_WEAK", (weak, body)
        assert body["details"]["failed"] == expected_failed, (weak, body["details"])


async def test_change_password_accepts_strong_new(client, gym_a):
    token = await _set_must_change(client, flag=False)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "owner-pass-123", "new_password": "Owner-Pass-123!"},
    )
    assert res.status_code == 200, res.text
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-gyma@example.com", "password": "Owner-Pass-123!"},
    )
    assert login_res.status_code == 200, login_res.text
    await _restore_password("owner-gyma@example.com", "owner-pass-123")
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -q -k "weak_new or accepts_strong"`
Expected: `test_change_password_rejects_weak_new` FAILS (weak passwords currently return 200); `accepts_strong` may PASS already (strong password meets old min-8 rule).

- [ ] **Step 3: Implement enforcement**

`backend/app/core/security.py` — add `import re` at the top and this function after the hasher setup:

```python
def password_rule_failures(password: str) -> list[str]:
    """Return the complexity rule codes `password` fails.

    Codes: uppercase, lowercase, digit, special, length. Mirrored on the
    frontend by apps/web/src/lib/password.ts (keep in sync).
    """
    failures: list[str] = []
    if not re.search(r"[A-Z]", password):
        failures.append("uppercase")
    if not re.search(r"[a-z]", password):
        failures.append("lowercase")
    if not re.search(r"\d", password):
        failures.append("digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        failures.append("special")
    if len(password) < 8:
        failures.append("length")
    return failures
```

`backend/app/modules/identity/schemas.py` — change `ChangePasswordRequest` (line 22-24) to drop the field-level `min_length` on `new_password` (the custom check now owns length, so short passwords get the consistent `PASSWORD_TOO_WEAK` + `["length"]` shape):

```python
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(max_length=128)
```

`backend/app/modules/identity/service.py` — import the helper (extend the existing `from app.core.security import ...` line):

```python
from app.core.security import hash_password, password_rule_failures, verify_password
```

In `change_password`, after the current-password verification (`if not verify_password(...)` block, line 244-245) and BEFORE hashing, insert:

```python
    failures = password_rule_failures(new_password)
    if failures:
        raise ValidationError(
            "Password does not meet the complexity requirements",
            code="PASSWORD_TOO_WEAK",
            details={"failed": failures},
        )
```

(Order: current-password check first — wrong current keeps returning `INVALID_CURRENT_PASSWORD` regardless of the new password's strength.)

- [ ] **Step 4: Run new tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -q -k "weak_new or accepts_strong"`
Expected: both PASS.

- [ ] **Step 5: Fix collateral tests that change passwords to the weak `owner-pass-123`**

Two existing tests set `new_password: "owner-pass-123"` (no uppercase → now 422). Rewrite them:

`test_change_password_clears_flag_and_rotates` (line ~319):

```python
async def test_change_password_clears_flag_and_rotates(client, gym_a):
    token = await _set_must_change(client, flag=True)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "owner-pass-123", "new_password": "Owner-Pass-123!"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["must_change"] is False

    new_headers = {"Authorization": f"Bearer {body['access_token']}"}
    ok = await client.get("/api/v1/members", headers=new_headers)
    assert ok.status_code == 200, ok.text

    # Flag is cleared in the DB too — a fresh login with the NEW password works.
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-gyma@example.com", "password": "Owner-Pass-123!"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["must_change"] is False
    # Restore the shared fixture password (direct DB — the API can't set a
    # weak password anymore).
    await _restore_password("owner-gyma@example.com", "owner-pass-123")
```

`test_change_password_revokes_old_refresh_token` (line ~425):

```python
async def test_change_password_revokes_old_refresh_token(client, gym_a):
    """The pair minted by change-password works; the pre-change refresh token
    is revoked and cannot be replayed."""
    await _set_must_change(client, flag=True)
    tokens = await login(client, "owner-gyma@example.com", "owner-pass-123")

    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"current_password": "owner-pass-123", "new_password": "Owner-Pass-123!"},
    )
    assert res.status_code == 200, res.text

    stale = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert stale.status_code == 401, stale.text

    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": res.json()["refresh_token"]}
    )
    assert rotated.status_code == 200, rotated.text

    await _restore_password("owner-gyma@example.com", "owner-pass-123")
    await _set_must_change(client, flag=False)
```

`test_change_password_rejects_wrong_current` (line ~343): **unchanged** — wrong current is checked before strength, still `INVALID_CURRENT_PASSWORD`.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest && .venv/bin/ruff check app tests scripts`
Expected: all tests pass (was 95 before this task; expect 97), ruff clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/security.py backend/app/modules/identity/schemas.py backend/app/modules/identity/service.py backend/tests/test_auth.py
git commit -m "feat(identity): enforce password complexity on change-password

422 PASSWORD_TOO_WEAK with failed rule codes; current-password check
runs first so wrong-current keeps its existing error."
```

---

### Task 3: Backend — split-name update + email freeze (TDD)

**Files:**
- Modify: `backend/app/modules/identity/schemas.py` (`UserOut`, `MeUpdateRequest`)
- Modify: `backend/app/modules/identity/service.py:144-170` (`update_me`)
- Modify: `backend/app/modules/identity/api.py:108-120` (`update_me_route`)
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_auth.py` (uses existing `login` helper, `gym_a` fixture, and the session-scoped `platform_token` fixture from conftest):

```python
async def test_update_me_first_last_name(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original = before.json()["user"]["full_name"]

    res = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"first_name": "Ada", "last_name": "Lovelace"},
    )
    assert res.status_code == 200, res.text
    body = res.json()["user"]
    assert body["first_name"] == "Ada"
    assert body["last_name"] == "Lovelace"
    assert body["full_name"] == "Ada Lovelace"

    # Legacy full_name path keeps the split columns in sync too.
    res2 = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": original}
    )
    assert res2.status_code == 200, res2.text
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()["user"]
    assert me["full_name"] == original
    parts = original.split(" ", 1)
    assert me["first_name"] == parts[0]
    assert me["last_name"] == (parts[1] if len(parts) > 1 else "")


async def test_update_me_platform_email_frozen(client, platform_token):
    headers = {"Authorization": f"Bearer {platform_token}"}
    before = await client.get("/api/v1/auth/me", headers=headers)
    assert before.status_code == 200
    original_full = before.json()["user"]["full_name"]

    # Split-name update works for platform actors.
    res = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"first_name": "Frozen", "last_name": "Admin"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["user"]["full_name"] == "Frozen Admin"
    assert res.json()["user"]["first_name"] == "Frozen"

    # Email change is rejected for platform actors.
    frozen = await client.patch(
        "/api/v1/auth/me", headers=headers, json={"email": "not-frozen@example.com"}
    )
    assert frozen.status_code == 403, frozen.text
    assert frozen.json()["error"]["code"] == "EMAIL_FROZEN"

    # Email untouched after the rejected attempt.
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()
    assert me["user"]["email"] == "platform@example.com"

    # Restore the seeded name so later runs see the original state.
    await client.patch(
        "/api/v1/auth/me", headers=headers, json={"full_name": original_full}
    )
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -q -k "first_last or email_frozen"`
Expected: FAIL — `first_name` is an unexpected/ignored field (response lacks `first_name`) and the platform email PATCH currently succeeds (200) instead of 403.

- [ ] **Step 3: Extend the schemas**

`backend/app/modules/identity/schemas.py` — `UserOut` (line 35-44): add the two fields after `full_name` (defaults keep `from_attributes` tolerant of pre-migration rows):

```python
class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    first_name: str = ""
    last_name: str = ""
    phone: str | None
    is_active: bool
    is_platform: bool
    created_at: datetime

    model_config = {"from_attributes": True}
```

`MeUpdateRequest` (line 76-83):

```python
class MeUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    email: EmailStr | None = None
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)

    @field_validator("full_name", mode="before")
    @classmethod
    def normalize_name(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def normalize_split_names(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v
```

(`before`-mode strip runs before `min_length`, so `first_name: "   "` → 422; `last_name: ""` stays legal.)

- [ ] **Step 4: Extend the service**

`backend/app/modules/identity/service.py` — add `split_full_name` to the models import (line ~10-30; extend the existing `from .models import ...`):

```python
from .models import (
    ...existing names...,
    split_full_name,
)
```

Rewrite `update_me` (line 144-170):

```python
async def update_me(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    full_name: str | None = None,
    email: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
) -> User:
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFoundError("User not found", code="NOT_FOUND")
    if first_name is not None or last_name is not None:
        new_first = (first_name if first_name is not None else user.first_name).strip()
        new_last = (last_name if last_name is not None else user.last_name).strip()
        if not new_first:
            raise ValidationError("First name is required", code="VALIDATION")
        user.first_name = new_first
        user.last_name = new_last
        user.full_name = f"{new_first} {new_last}".strip()
    elif full_name is not None:
        user.full_name = full_name.strip()
        user.first_name, user.last_name = split_full_name(user.full_name)
    if email is not None:
        normalized = email.lower()
        if normalized != user.email and await _email_taken_elsewhere(
            normalized, exclude_user_id=user.id
        ):
            raise ConflictError("User already exists", code="EMAIL_TAKEN")
        user.email = normalized
    try:
        await session.flush()
    except IntegrityError:
        # Concurrent claim of the same same-tenant email races past the
        # check-then-update probe and trips uq_users_tenant_email_active.
        await session.rollback()
        raise ConflictError("User already exists", code="EMAIL_TAKEN") from None
    return user
```

(`ValidationError` is already imported in this file — used by `change_password`.)

- [ ] **Step 5: Extend the route (email freeze + pass-through)**

`backend/app/modules/identity/api.py` — add `ForbiddenError` to the errors import (extend the existing `from app.core.errors import ...` line). In `update_me_route` (line 108-120), before the service call:

```python
@router.patch("/me", response_model=MeOut)
async def update_me_route(
    body: MeUpdateRequest,
    actor: Annotated[Actor, Depends(get_actor_context)],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MeOut:
    if actor.is_platform and body.email is not None and body.email.lower() != actor.email:
        raise ForbiddenError("Email can't be changed", code="EMAIL_FROZEN")
    user = await identity_svc.update_me(
        session,
        user_id=actor.user_id,
        full_name=body.full_name,
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
    )
    return await _me_payload(session, actor, user)
```

- [ ] **Step 6: Run new tests, then the full backend suite**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -q -k "first_last or email_frozen"`
Expected: both PASS.

Run: `cd backend && .venv/bin/python -m pytest && .venv/bin/ruff check app tests scripts`
Expected: full suite green (was 97; expect 99), ruff clean. Existing `test_update_me_*` tests keep passing via the legacy `full_name` branch.

- [ ] **Step 7: Commit**

```bash
git add backend/app/modules/identity/schemas.py backend/app/modules/identity/service.py backend/app/modules/identity/api.py backend/tests/test_auth.py
git commit -m "feat(identity): update-me first/last name + freeze platform email

PATCH /auth/me accepts first_name/last_name (legacy full_name path
also splits into the new columns); platform actors get 403
EMAIL_FROZEN on email changes."
```

---

### Task 4: Frontend — `passwordChecks` util (TDD)

**Files:**
- Create: `apps/web/src/lib/password.ts`
- Test: `apps/web/src/lib/password.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/password.test.ts` (same node:test style as `src/lib/adapters.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allChecksPass, passwordChecks } from "./password.ts";

test("empty password fails everything", () => {
  const c = passwordChecks("");
  assert.deepEqual(c, {
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
    length: false,
  });
  assert.equal(allChecksPass(c), false);
});

test("partial password: only its rules pass", () => {
  const c = passwordChecks("abc1!");
  assert.equal(c.uppercase, false);
  assert.equal(c.lowercase, true);
  assert.equal(c.number, true);
  assert.equal(c.special, true);
  assert.equal(c.length, false); // 5 chars
  assert.equal(allChecksPass(c), false);
});

test("strong password passes every rule", () => {
  const c = passwordChecks("Owner-Pass-123!");
  assert.deepEqual(c, {
    uppercase: true,
    lowercase: true,
    number: true,
    special: true,
    length: true,
  });
  assert.equal(allChecksPass(c), true);
});

test("hyphen and space count as special; digits do not satisfy upper/lower", () => {
  assert.equal(passwordChecks("AAAA-BBBB12").special, true);
  assert.equal(passwordChecks("AAAA BBBB12").special, true);
  assert.equal(passwordChecks("ABCDEFGHIJ1!").lowercase, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npm test`
Expected: FAIL — cannot resolve `./password.ts`.

- [ ] **Step 3: Implement the util**

Create `apps/web/src/lib/password.ts`:

```ts
// Mirrors backend/app/core/security.py:password_rule_failures — keep in sync.
export interface PasswordChecks {
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
  length: boolean;
}

export function passwordChecks(pw: string): PasswordChecks {
  return {
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
    length: pw.length >= 8,
  };
}

export function allChecksPass(c: PasswordChecks): boolean {
  return c.uppercase && c.lowercase && c.number && c.special && c.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npm test`
Expected: all pass (was 10; expect 14).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/password.ts apps/web/src/lib/password.test.ts
git commit -m "feat(web): passwordChecks util + unit tests"
```

---

### Task 5: Frontend — dispatcher + GymSettings verbatim move

**Files:**
- Create: `apps/web/src/app/(app)/settings/GymSettings.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx` (becomes dispatcher)

- [ ] **Step 1: Move the current page into GymSettings.tsx**

Create `apps/web/src/app/(app)/settings/GymSettings.tsx` containing the ENTIRE current `page.tsx` content (lines 1-247), with exactly these changes:

1. Rename the exported component: `export default function SettingsPage()` → `export default function GymSettings()`.
2. Nothing else. All imports, `prettifyPermission`, all sections (Profile full-name+email, Your role & permissions, Granted permissions, Gym profile, Branch access, Danger zone), all ids (`settings-full-name`, `settings-email`, `settings-gym-name`, `settings-timezone`), all labels, and the Toast stay byte-for-byte identical.

- [ ] **Step 2: Replace page.tsx with the dispatcher**

Overwrite `apps/web/src/app/(app)/settings/page.tsx` with:

```tsx
"use client";

import { useAuth } from "@/lib/auth";
import GymSettings from "./GymSettings";
import PlatformSettings from "./PlatformSettings";

export default function SettingsPage() {
  const { me } = useAuth();
  // The (app) layout blocks children until `me` is loaded, so this branch
  // never flashes the wrong variant.
  return me?.is_platform ? <PlatformSettings /> : <GymSettings />;
}
```

- [ ] **Step 3: Create a temporary PlatformSettings stub**

The dispatcher imports it; the real component lands in Task 6. Create `apps/web/src/app/(app)/settings/PlatformSettings.tsx`:

```tsx
"use client";

export default function PlatformSettings() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-[13px] text-ink-faint">Platform settings load here.</p>
    </div>
  );
}
```

- [ ] **Step 4: Type-check + gym-user regression**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

Run: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs`
Expected: 33/33 (settings block selectors all live in GymSettings verbatim).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/settings/page.tsx apps/web/src/app/\(app\)/settings/GymSettings.tsx apps/web/src/app/\(app\)/settings/PlatformSettings.tsx
git commit -m "refactor(web): settings page dispatches to Gym/Platform variants"
```

---

### Task 6: Frontend — PlatformSettings profile (first/last + frozen email)

**Files:**
- Modify: `apps/web/src/app/(app)/settings/PlatformSettings.tsx` (replace stub)
- Modify: `apps/web/src/lib/types.ts:1-9` (`User` interface)
- Modify: `apps/web/src/lib/hooks.ts:815-820` (`useUpdateMe`)

- [ ] **Step 1: Extend the FE types + hook**

`apps/web/src/lib/types.ts` — `User` interface (line 1-9):

```ts
export interface User {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  is_platform: boolean;
  created_at: string;
}
```

`apps/web/src/lib/hooks.ts` — `useUpdateMe` (line 815-820):

```ts
export function useUpdateMe() {
  return useMutation({
    mutationFn: (body: {
      full_name?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
    }) =>
      apiFetch<MeOut>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
  });
}
```

- [ ] **Step 2: Write PlatformSettings with the Profile card**

Overwrite `apps/web/src/app/(app)/settings/PlatformSettings.tsx` with the Profile card (password card comes in Task 7 — include the placeholder comment `// Password card added in Task 7.` after the profile Card so the file is valid):

```tsx
"use client";

import { useState } from "react";
import { Button, Card, Field, Input, SectionTitle, Toast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUpdateMe } from "@/lib/hooks";

export default function PlatformSettings() {
  const { me, refreshMe } = useAuth();
  const user = me?.user;
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function notify(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }
  const updateMe = useUpdateMe();
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const updated = await updateMe.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      // PATCH response is the full MeOut — feed it straight into the context
      // (same pattern as GymSettings.saveProfile).
      await refreshMe(updated);
      setFirstName(updated.user.first_name);
      setLastName(updated.user.last_name);
      notify("Profile updated");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        notify("Email can't be changed", "error");
      } else if (e instanceof ApiError && e.status === 422) {
        notify("Check the name format", "error");
      } else {
        notify("Could not save profile — check your connection", "error");
      }
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <SectionTitle title="Profile" subtitle="Your account details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input
              id="settings-first-name"
              name="settings-first-name"
              aria-label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name">
            <Input
              id="settings-last-name"
              name="settings-last-name"
              aria-label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              id="settings-email"
              name="settings-email"
              aria-label="Email"
              value={user?.email ?? ""}
              readOnly
              disabled
            />
          </Field>
        </div>
        <p className="mt-2 text-[12px] text-ink-faint">Email can't be changed.</p>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={saveProfile}
            disabled={savingProfile || firstName.trim().length < 1}
          >
            {savingProfile ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      {/* Password card added in Task 7. */}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Type-check + platform gate (hooks.ts is a shared frozen-surface file)**

Run: `cd apps/web && npx tsc --noEmit && npm test`
Expected: clean / 14 pass.

Run: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`
Expected: 30/30 (gate untouched by this task; runs because `hooks.ts` changed).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/settings/PlatformSettings.tsx apps/web/src/lib/types.ts apps/web/src/lib/hooks.ts
git commit -m "feat(web): platform settings profile with split name + frozen email"
```

---

### Task 7: Frontend — password card with live strength checklist

**Files:**
- Modify: `apps/web/src/app/(app)/settings/PlatformSettings.tsx`

- [ ] **Step 1: Add the password card**

In `PlatformSettings.tsx`: extend the imports to:

```tsx
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUpdateMe } from "@/lib/hooks";
import { allChecksPass, passwordChecks } from "@/lib/password";
import type { PasswordChecks } from "@/lib/password";
import type { TokenResponse } from "@/lib/types";
```

Add the checklist component above `export default function PlatformSettings`:

```tsx
const CHECK_ROWS: { key: keyof PasswordChecks; label: string }[] = [
  { key: "uppercase", label: "Uppercase letter" },
  { key: "lowercase", label: "Lowercase letter" },
  { key: "number", label: "Number" },
  { key: "special", label: "Special character" },
  { key: "length", label: "At least 8 characters" },
];

function PasswordChecklist({ checks }: { checks: PasswordChecks }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Password strength">
      {CHECK_ROWS.map((row) => (
        <li key={row.key} className="flex items-center gap-2 text-[12px]">
          <span aria-hidden className={checks[row.key] ? "text-green" : "text-ink-faint"}>
            {checks[row.key] ? "✓" : "✗"}
          </span>
          <span className={checks[row.key] ? "text-ink-soft" : "text-ink-faint"}>
            {row.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

Inside the component, after the profile state, add password state + derived flags (and pull `completePasswordChange` from `useAuth()`):

```tsx
  const { me, refreshMe, completePasswordChange } = useAuth();
  // ...existing profile state...
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const checks = passwordChecks(next);
  const canSubmitPassword =
    allChecksPass(checks) && next === confirm && next.length > 0 && current.length > 0;
```

Add the submit handler (after `saveProfile`):

```tsx
  async function savePassword() {
    setCurrentError(null);
    setChangingPassword(true);
    try {
      const tokens = await apiFetch<TokenResponse>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      await completePasswordChange(tokens);
      setCurrent("");
      setNext("");
      setConfirm("");
      notify("Password updated");
    } catch (e) {
      if (e instanceof ApiError) {
        const detail = e.detail as { code?: string; message?: string; details?: { failed?: string[] } } | null;
        if (detail?.code === "INVALID_CURRENT_PASSWORD") {
          setCurrentError("Current password is incorrect");
        } else if (detail?.code === "PASSWORD_TOO_WEAK") {
          notify(
            `Password too weak — missing: ${detail.details?.failed?.join(", ") ?? "requirements"}`,
            "error",
          );
        } else {
          notify(detail?.message ?? "Could not change password", "error");
        }
      } else {
        notify("Could not reach the server", "error");
      }
    } finally {
      setChangingPassword(false);
    }
  }
```

Replace the `{/* Password card added in Task 7. */}` placeholder with:

```tsx
      <Card className="p-6">
        <SectionTitle title="Password" subtitle="Change your account password" />
        <div className="space-y-4">
          <Field label="Current password">
            <Input
              type="password"
              id="settings-current-password"
              name="settings-current-password"
              aria-label="Current password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <div>
            <Field label="New password">
              <Input
                type="password"
                id="settings-new-password"
                name="settings-new-password"
                aria-label="New password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <PasswordChecklist checks={checks} />
          </div>
          <Field label="Confirm new password">
            <Input
              type="password"
              id="settings-confirm-password"
              name="settings-confirm-password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {confirm.length > 0 && next !== confirm && (
            <p className="text-[13px] text-red">Passwords do not match.</p>
          )}
          {currentError && <p className="text-[13px] text-red">{currentError}</p>}
          <div className="flex justify-end">
            <Button
              onClick={savePassword}
              disabled={!canSubmitPassword || changingPassword}
            >
              {changingPassword ? "Saving…" : "Update password"}
            </Button>
          </div>
        </div>
      </Card>
```

- [ ] **Step 2: Type-check + unit**

Run: `cd apps/web && npx tsc --noEmit && npm test`
Expected: clean / 14 pass.

- [ ] **Step 3: Manual smoke (dev server is running)**

Open `http://localhost:3000/settings` as the platform admin: first/last seeded, email greyed; typing `abcdefgh` in new password shows ✓ on lowercase+length only and Update password stays disabled; `Owner-Pass-123!` + matching confirm enables it. (Do NOT submit — admin's fixture password must stay `admin-pass-123` for future e2e runs.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/settings/PlatformSettings.tsx
git commit -m "feat(web): platform settings password card with live strength checklist"
```

---

### Task 8: E2E — platform gate settings checks

**Files:**
- Modify: `apps/web/e2e/platform_admin_verify.cjs` (insert before the "Platform revenue" section, ~line 262)

- [ ] **Step 1: Add the settings section**

Insert immediately before the `// ── Platform revenue` comment block:

```js
    // ── Settings (platform admin): profile split + frozen email + checklist ──
    await page.goto(`${BASE}/settings`);
    const firstNameInput = page.locator("#settings-first-name");
    await must(
      "settings: first/last name inputs render",
      firstNameInput.waitFor({ timeout: 15000 }),
    );
    const seededFirst = await firstNameInput.inputValue();
    const seededLast = await page.locator("#settings-last-name").inputValue();
    check("settings: first name seeded", seededFirst.length > 0, seededFirst);
    check("settings: email is disabled", await page.locator("#settings-email").isDisabled());
    check(
      "settings: role/permissions sections removed",
      (await page.getByText("Granted permissions").count()) === 0 &&
        (await page.getByText("Your role & permissions").count()) === 0,
    );

    // Checklist is live; do NOT submit — admin's fixture password must stay
    // admin-pass-123 for future runs (backend success path covered by pytest).
    await page.locator("#settings-current-password").fill("whatever-1");
    await page.locator("#settings-new-password").fill("abcdefgh");
    await must(
      "settings: weak password keeps submit disabled",
      page.waitForFunction(
        () => {
          const btn = [...document.querySelectorAll("button")].find((b) =>
            /update password/i.test(b.textContent ?? ""),
          );
          return btn?.disabled === true;
        },
        null,
        { timeout: 5000 },
      ),
    );
    await page.locator("#settings-new-password").fill("Str0ng!Pass");
    await page.locator("#settings-confirm-password").fill("Str0ng!Pass");
    await must(
      "settings: strong password enables submit",
      page.waitForFunction(
        () => {
          const btn = [...document.querySelectorAll("button")].find((b) =>
            /update password/i.test(b.textContent ?? ""),
          );
          return btn?.disabled === false;
        },
        null,
        { timeout: 5000 },
      ),
    );

    // Split-name save persists, then restore the seeded values.
    await page.locator("#settings-last-name").fill("E2E Temp");
    await page.getByRole("button", { name: "Save changes" }).click();
    await must(
      "settings: split-name save persists",
      page.getByText("Profile updated").waitFor({ timeout: 10000 }),
    );
    await page.locator("#settings-first-name").fill(seededFirst);
    await page.locator("#settings-last-name").fill(seededLast);
    await page.getByRole("button", { name: "Save changes" }).click();
    await must(
      "settings: seeded names restored",
      page.getByText("Profile updated").waitFor({ timeout: 10000 }),
    );
```

- [ ] **Step 2: Run the platform gate**

Run: `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`
Expected: 38/38 (was 30; +8 new checks). If a check flakes on first nav (known flake class in this suite), re-run once.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/platform_admin_verify.cjs
git commit -m "test(e2e): platform settings profile + password checklist checks

Gate 30 -> 38. Success-path password submit intentionally not clicked:
the admin fixture password must stay admin-pass-123 (weak, rejected by
the new rules); API success path covered by pytest."
```

---

### Task 9: Full battery + summary

- [ ] **Step 1: Backend**

Run: `cd backend && .venv/bin/python -m pytest && .venv/bin/ruff check app tests scripts`
Expected: 99 passed; ruff clean.

- [ ] **Step 2: Frontend**

Run: `cd apps/web && npx tsc --noEmit && npm test`
Expected: clean; 14 pass.

- [ ] **Step 3: E2E battery (sequential)**

```bash
cd apps/web
for s in platform_admin gym_ops plans member_account role_visibility frontdesk expenses; do
  echo "== $s =="
  NODE_PATH="$(npm root -g)" node e2e/${s}_verify.cjs 2>&1 | tail -1
done
```
Expected: platform 38/38, gym_ops 33/33, plans 9/9, member_account 15/15, role_visibility 18/18, frontdesk 29/29, expenses 13/13. (Known flake class: first-nav login timeouts — verify data state and re-run once before investigating.)

- [ ] **Step 4: Confirm clean tree + report**

Run: `cd /Users/amit/Documents/Forge && git status --short && git log --oneline -9`
Expected: clean tree. Report commits + gate results + note that admin's password was intentionally never changed by e2e.
