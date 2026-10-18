# Bug-Fix Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 11 QA bugs + a11y + must_change full-stack gate + pagination per `docs/superpowers/specs/2026-10-18-bugfix-round-design.md`, then verify end-to-end: full automated battery + per-role Chrome DevTools QA covering every module/functionality.

**Architecture:** Three backend behavioral changes (multi-word search, notifications mark-all, must_change gate + new change-password endpoint) and a set of frontend truthfulness/robustness fixes (chart pixels, billing filters, typed toasts, perm-gated pollers, in-flight guards, a11y, pagination). Frozen platform panel: only user-approved touches (poller skip, client-side revenue pagination, a11y attributes, toast-outcome fixes on shared files) — gate must stay 22/22 after every shared-file task.

**Tech Stack:** Next.js 15 / React Query / FastAPI / SQLAlchemy / pytest+httpx / Playwright e2e / Chrome DevTools MCP.

**Ground rules:**
- Dev servers RUNNING on :3000/:8000 — do not restart (if dead: `make dev` / `make web` from repo root).
- Frozen platform surface (`AGENTS.md`): platform pages/API byte-identical except the user-approved items in this plan. After ANY change to `ui.tsx`, `skeleton*.tsx`, `hooks.ts`, `api.ts`, `lib/auth.tsx`, `(app)/layout.tsx`, or backend routes: run `cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs` — must be 22/22 before finishing the task.
- Never `git add -A`; stage only task files. Commit directly to `main`.
- Backend gates from `backend/`: `.venv/bin/python -m pytest -q` (baseline 67 passed), `.venv/bin/ruff check app tests scripts`.
- Frontend gates from `apps/web`: `npx tsc --noEmit`, `npm test` (baseline 3 pass), unit glob is `src/lib/*.test.ts`.
- e2e scripts self-provision and share one dev DB — run SEQUENTIALLY.
- Role logins: platform `admin@gym-erp.dev`/`admin-pass-123`; owner `demo-owner@gym-erp.dev`/`owner-pass-123`; evolve `mramitdas99@gmail.com`/`evolve-import-2026`; manager `branch-manager@gym-erp.dev`/`manager-pass-123`; receptionist `receptionist@gym-erp.dev`/`receptionist-pass-123`; trainer `trainer@gym-erp.dev`/`trainer-pass-123`.
- JSON error contract: HTTP errors body is `{detail:{error:{code,message,details}}}` (see `backend/app/core/errors.py:to_http_exception`).

**Bug → task map (spec numbering):**

| Bug | Task |
|-----|------|
| 2 multi-word search | Task 1 |
| 5 stuck unread badge (mark-all) | Task 2 |
| 11 must_change ignored | Tasks 3 (BE) + 4 (FE) |
| 1 chart bars 0px | Task 5 |
| 6a/6b/8 billing truth (Outstanding/Overdue/Pay now) | Task 6 |
| 6 toast colors (plans, member-detail) + 7 check-in reason/colors | Task 7 |
| 9 platform 403 noise | Task 8 (GATE) |
| 3 double-submit duplicates | Task 9 |
| a11y labels/aria/role | Task 10 (GATE) |
| expenses + revenue pagination | Task 11 (GATE) |
| e2e coverage for fixes | Task 12 |
| full battery | Task 13 |
| per-role Chrome DevTools QA | Task 14 |

**File structure:**

```
backend/app/modules/members/service.py            search clause (Task 1)
backend/app/modules/notifications/service.py      mark_all_read (Task 2)
backend/app/modules/notifications/api.py          POST /mark-all (Task 2)
backend/app/modules/identity/{schemas,service,api}.py  must_change + change-password (Task 3)
backend/app/deps.py                               Actor.must_change + reject_if_must_change (Task 3)
backend/app/main.py                               router gate dependency (Task 3)
backend/tests/{test_members_search,test_notifications,test_auth}.py (Tasks 1-3)
apps/web/src/app/(app)/page.tsx                   chart px + quick check-in guard (Tasks 5, 9)
apps/web/src/lib/adapters.ts + adapters.test.ts   partial-overdue derivation (Task 6)
apps/web/src/app/(app)/billing/page.tsx           Outstanding/Overdue/Pay now + pay guard (6, 9)
apps/web/src/app/(app)/{plans,members/[id],checkins}/page.tsx  typed toasts + reason (Task 7)
apps/web/src/lib/hooks.ts                         poller gates, mark-all, expenses page (8, 2, 11)
apps/web/src/lib/inflight.ts (new)                useInFlight (Task 9)
apps/web/src/lib/{api.ts,auth.tsx,types.ts}       ApiError.code, must_change state (Task 4)
apps/web/src/app/change-password/page.tsx (new)   forced password screen (Task 4)
apps/web/src/app/(app)/layout.tsx                 must_change redirect + aria-labels (4, 10)
apps/web/src/components/ui.tsx                    Toast role/aria (Task 10)
apps/web/src/app/(app)/expenses/page.tsx          server pagination (Task 11)
apps/web/src/app/(app)/platform/revenue/page.tsx  client pagination (Task 11)
apps/web/e2e/{frontdesk,gym_ops}_verify.cjs       new checks (Task 12)
```

---

### Task 1: Multi-word member search (Bug 2)

**Files:**
- Modify: `backend/app/modules/members/service.py:209-218`
- Test: `backend/tests/test_members_search.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_members_search.py`:

```python
from __future__ import annotations

from tests.helpers import login


async def _branch_id(client, token) -> str:
    response = await client.post(
        "/api/v1/branches",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Search Branch", "code": "SB", "timezone": "Asia/Kolkata"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_search_matches_full_name(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _branch_id(client, token)
    created = await client.post(
        "/api/v1/members",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "first_name": "DblClick",
            "last_name": "QA",
            "email": "dblclick-qa@example.com",
            "phone": "+919900000011",
            "branch_id": branch,
            "status": "prospect",
        },
    )
    assert created.status_code == 201, created.text
    member_id = created.json()["id"]

    for query in ("DblClick QA", "DblClick", "QA"):
        response = await client.get(
            "/api/v1/members",
            params={"search": query},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        ids = [m["id"] for m in response.json()["items"]]
        assert member_id in ids, f"search={query!r} missed member: {ids}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_members_search.py -v`
Expected: FAIL on the `"DblClick QA"` case (member not in `ids`).

- [ ] **Step 3: Implement the fix**

In `backend/app/modules/members/service.py`, replace the `if search:` block inside `list_members` (lines 209-218) with:

```python
    if search:
        like = f"%{search.lower()}%"
        full_name = func.lower(func.concat(Member.first_name, " ", Member.last_name))
        stmt = stmt.where(
            or_(
                full_name.like(like),
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                Member.phone.like(like),
            )
        )
```

(`func` and `or_` are already imported in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_members_search.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Full backend gates + commit**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
cd .. && git add backend/app/modules/members/service.py backend/tests/test_members_search.py
git commit -m "fix(members): match multi-word search against full name"
```

---

### Task 2: Notifications mark-all (Bug 5)

**Files:**
- Modify: `backend/app/modules/notifications/service.py`, `backend/app/modules/notifications/api.py`
- Modify: `apps/web/src/lib/hooks.ts` (add `useMarkAllNotificationsRead` near `useMarkNotificationRead`, line ~709)
- Modify: `apps/web/src/app/(app)/notifications/page.tsx:62-77`
- Test: `backend/tests/test_notifications.py`

- [ ] **Step 1: Write the failing backend test**

Append to `backend/tests/test_notifications.py`:

```python
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.identity.models import User
from app.modules.notifications.service import create_notification
from sqlalchemy import select

from tests.helpers import login


async def test_mark_all_read_clears_every_unread(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    # Seed 3 unread rows via the proven platform-scope session pattern
    # (same as conftest._make_user).
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    async with maker() as session:
        async with session.begin():
            user_id = await session.scalar(
                select(User.id).where(User.email == "owner-gyma@example.com")
            )
            for i in range(3):
                await create_notification(
                    session, user_id=user_id, title=f"MarkAll {i}", body="x", type="info"
                )
    reset_tenant_context(token_ctx)

    before = (await client.get("/api/v1/notifications/unread-count", headers=headers)).json()["count"]
    assert before >= 3

    res = await client.post("/api/v1/notifications/mark-all", headers=headers)
    assert res.status_code == 200, res.text

    after = (await client.get("/api/v1/notifications/unread-count", headers=headers)).json()["count"]
    assert after == 0
```

(Trim the import list to what the file doesn't already import — `login`, `create_notification`, `User`, the tenant-context helpers, `get_sessionmaker`, `select`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_notifications.py -v`
Expected: FAIL with 404 on `POST /api/v1/notifications/mark-all`.

- [ ] **Step 3: Implement backend**

In `backend/app/modules/notifications/service.py`, add after `mark_read`:

```python
async def mark_all_read(session: AsyncSession, *, user_id: uuid.UUID) -> int:
    result = await session.execute(
        select(InAppNotification).where(
            InAppNotification.user_id == user_id,
            InAppNotification.read_at.is_(None),
        )
    )
    count = 0
    now = datetime.now()
    for notification in result.scalars():
        notification.read_at = now
        count += 1
    return count
```

In `backend/app/modules/notifications/api.py`, add import `mark_all_read` to the service import list and add the route:

```python
@router.post("/mark-all", response_model=dict)
async def mark_all(
    actor: Annotated[Actor, Depends(require_permission("notifications.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> dict:
    count = await mark_all_read(session, user_id=actor.user_id)
    return {"count": count}
```

- [ ] **Step 4: Run backend test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_notifications.py -q`
Expected: PASS.

- [ ] **Step 5: Frontend wiring — hook**

In `apps/web/src/lib/hooks.ts`, next to `useMarkNotificationRead` (line ~709), add:

```ts
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ count: number }>("/notifications/mark-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
```

- [ ] **Step 6: Frontend wiring — notifications page**

In `apps/web/src/app/(app)/notifications/page.tsx`, add import of `useMarkAllNotificationsRead` from `@/lib/hooks`, create `const markAllMutation = useMarkAllNotificationsRead();`, and replace the `markAll` function (lines 62-77) with:

```ts
  async function markAll() {
    if (isMarkingAll) return;
    setMarkingAll(true);
    try {
      await markAllMutation.mutateAsync();
      notify("All notifications marked as read");
    } catch {
      notify("Could not mark notifications as read", "error");
    } finally {
      setMarkingAll(false);
    }
  }
```

Also add the 50-cap hint right after the closing `</Async>` of the list Card:

```tsx
      {notifications.length === 50 && (
        <p className="text-center text-[12px] text-ink-faint">
          Showing the latest 50 notifications.
        </p>
      )}
```

*Deviation from spec:* the hint says "latest 50" without "of N" — an `N` total would require changing the `GET /notifications` response shape (array → object), breaking every consumer for cosmetic value. The stuck-badge bug (the actual requirement) is fully fixed by mark-all.

- [ ] **Step 7: Gates + commit**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
cd ../apps/web && npx tsc --noEmit
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22 (hooks.ts touched)
cd ../..
git add backend/app/modules/notifications/service.py backend/app/modules/notifications/api.py backend/tests/test_notifications.py apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/notifications/page.tsx"
git commit -m "feat(notifications): mark-all endpoint clears every unread"
```

---

### Task 3: must_change backend gate (Bug 11, backend)

**Files:**
- Modify: `backend/app/modules/identity/schemas.py` (`TokenResponse`, `MeOut`, new `ChangePasswordRequest`)
- Modify: `backend/app/modules/identity/service.py` (`_issue_for_user`, `authenticate`, `refresh_tokens`, new `change_password`)
- Modify: `backend/app/modules/identity/api.py` (`_me_payload`, new `/auth/change-password`)
- Modify: `backend/app/deps.py` (`Actor.must_change`, `resolve_actor`, new `reject_if_must_change`)
- Modify: `backend/app/main.py` (router gate)
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_auth.py` (import `Credential` from `app.modules.identity.models`, plus `TenantContext`/`set_tenant_context`/`reset_tenant_context` from `app.core.tenant`, `get_sessionmaker` from `app.db.session`, `select` from `sqlalchemy` — reuse imports where the file already has them):

```python
async def _set_must_change(client, *, flag: bool) -> str:
    """Flip must_change on gym-a owner's credential, THEN log in so the minted
    access token carries the claim (the gate reads the JWT claim)."""
    maker = get_sessionmaker()
    token_ctx = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    async with maker() as session:
        async with session.begin():
            user_id = await session.scalar(
                select(User.id).where(User.email == "owner-gyma@example.com")
            )
            cred = await session.scalar(
                select(Credential).where(Credential.user_id == user_id)
            )
            cred.must_change = flag
    reset_tenant_context(token_ctx)
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-gyma@example.com", "password": "owner-pass-123"},
    )
    assert login_res.status_code == 200, login_res.text
    return login_res.json()["access_token"]


async def test_must_change_blocks_protected_routes(client, gym_a):
    token = await _set_must_change(client, flag=True)
    res = await client.get(
        "/api/v1/members", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403, res.text
    assert res.json()["detail"]["error"]["code"] == "MUST_CHANGE_PASSWORD"


async def test_change_password_clears_flag_and_rotates(client, gym_a):
    token = await _set_must_change(client, flag=True)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "owner-pass-123", "new_password": "owner-pass-123"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["must_change"] is False

    new_headers = {"Authorization": f"Bearer {body['access_token']}"}
    ok = await client.get("/api/v1/members", headers=new_headers)
    assert ok.status_code == 200, ok.text

    # Flag is cleared in the DB too — a fresh login is fully unblocked.
    login_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "owner-gyma@example.com", "password": "owner-pass-123"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["must_change"] is False


async def test_change_password_rejects_wrong_current(client, gym_a):
    token = await _set_must_change(client, flag=True)
    res = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "wrong-password", "new_password": "owner-pass-123"},
    )
    assert res.status_code == 422, res.text
    # Leave the shared fixture user unflagged for any test that runs after us.
    await _set_must_change(client, flag=False)
```

`_set_must_change(client, flag=False)` at the end is required: `gym_a` is session-scoped, and a lingering `must_change=True` would 403 every later test that logs in as that owner.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -v -k must_change`
Expected: FAIL (`must_change` unknown field / 404 on `/auth/change-password` / 200 instead of 403).

- [ ] **Step 3: Schemas**

In `backend/app/modules/identity/schemas.py`:

```python
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 -- JWT token_type claim name, not a secret
    expires_in: int
    must_change: bool = False
```

Add to `MeOut` (after `branches`):

```python
    must_change: bool = False
```

*Deviation from spec:* the flag is added to `MeOut` but not `UserOut` — `UserOut` serializes the `User` model via `from_attributes` while the flag lives on `Credential`; `MeOut` (built explicitly in `_me_payload`) is the only place that already joins extra data, and the frontend derives `mustChange` from `TokenResponse`/the 403 event anyway.

Add:

```python
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
```

- [ ] **Step 4: Identity service**

In `backend/app/modules/identity/service.py`:

`_issue_for_user` — add keyword param and claim (lines 54-67 region):

```python
async def _issue_for_user(
    session: AsyncSession,
    user: User,
    *,
    family_id: uuid.UUID | None = None,
    must_change: bool = False,
    ip: str | None = None,
    user_agent: str | None = None,
) -> TokenResponse:
    settings = get_settings()
    access, _ = create_access_token(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        claims={"is_platform": user.is_platform, "must_change": must_change},
    )
```

(rest of function unchanged)

`authenticate` — pass the flag (line 112):

```python
    return await issue_tokens(session, user, ip=ip, user_agent=user_agent)
```
becomes:
```python
    return await _issue_for_user(
        session, user, must_change=credential.must_change, ip=ip, user_agent=user_agent
    )
```

`refresh_tokens` — load the credential and pass the flag. After `user = await session.get(User, record.user_id)` and the active check, before `record.revoked_at = ...`:

```python
    credential = await session.scalar(
        select(Credential).where(Credential.user_id == user.id)
    )
```
and the return becomes:
```python
    return await _issue_for_user(
        session,
        user,
        family_id=record.family_id,
        must_change=bool(credential.must_change) if credential else False,
        ip=ip,
        user_agent=user_agent,
    )
```

Add `change_password` (after `logout`):

```python
async def change_password(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    current_password: str,
    new_password: str,
) -> TokenResponse:
    result = await session.execute(
        select(User, Credential)
        .join(Credential, Credential.user_id == User.id)
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    row = result.first()
    if row is None:
        raise UnauthenticatedError("Account not found", code="INVALID_CREDENTIALS")
    user, credential = row
    if not verify_password(current_password, credential.password_hash):
        raise ValidationError("Current password is incorrect", code="INVALID_CURRENT_PASSWORD")
    credential.password_hash = hash_password(new_password)
    credential.must_change = False
    records = await session.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    )
    for record in records:
        record.revoked_at = datetime.now(UTC)
    await session.flush()
    return await _issue_for_user(session, user)
```

Check imports: `ValidationError` must be imported alongside the other error classes; `Credential`, `hash_password`, `verify_password` should already be imported (verify `Credential` is — it is used by `_load_user_with_credential`). Add any missing to the import block.

- [ ] **Step 5: Actor + gate dependency**

In `backend/app/deps.py`:

Actor dataclass (add field with default, last position):

```python
@dataclass(frozen=True, slots=True)
class Actor:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    is_platform: bool
    email: str
    full_name: str
    must_change: bool = False
```

In `resolve_actor`, set the claim when constructing `Actor` (line ~45):

```python
            return Actor(
                user_id=user.id,
                tenant_id=user.tenant_id,
                is_platform=user.is_platform,
                email=user.email,
                full_name=user.full_name,
                must_change=bool(payload.get("must_change", False)),
            )
```

Add at the end of `deps.py`:

```python
async def reject_if_must_change(
    actor: Annotated[Actor, Depends(get_actor_context)],
) -> None:
    """Reject authenticated requests until the flagged user changes password."""
    if actor.must_change:
        raise ForbiddenError("Password change required", code="MUST_CHANGE_PASSWORD")
```

- [ ] **Step 6: API routes**

In `backend/app/modules/identity/api.py`, add route (after `update_me_route`, before `roles_router` handlers), importing `ChangePasswordRequest`:

```python
@router.post("/change-password", response_model=TokenResponse)
async def change_password_route(
    body: ChangePasswordRequest,
    actor: Annotated[Actor, Depends(get_actor_context)],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> TokenResponse:
    return await identity_svc.change_password(
        session,
        user_id=actor.user_id,
        current_password=body.current_password,
        new_password=body.new_password,
    )
```

Check imports: `TokenResponse` and `get_actor_context` must be imported (add to existing import lists).

In `_me_payload`, add the flag (query `Credential` — import it from `app.modules.identity.models`):

```python
    cred = await session.scalar(select(Credential).where(Credential.user_id == user.id))
```
and include `must_change=bool(cred.must_change) if cred else False` in the `MeOut(...)` construction.

- [ ] **Step 7: Router gate**

In `backend/app/main.py`, import `Depends` (if absent) and `reject_if_must_change` from `app.deps`, then replace the include block (lines 106-117) with:

```python
    gate = [Depends(reject_if_must_change)]
    app.include_router(auth_router, prefix=settings.api_prefix)
    app.include_router(roles_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(employees_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(platform_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(tenant_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(settings_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(members_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(membership_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(billing_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(expenses_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(attendance_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(notifications_router, prefix=settings.api_prefix, dependencies=gate)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth.py -v -k must_change`
Expected: 3 PASS. Then full suite: `.venv/bin/python -m pytest -q` → expect **72 passed** (67 baseline + 1 search + 1 mark-all + 3 must_change) and `.venv/bin/ruff check app tests scripts` clean. Also run `.venv/bin/python -m pytest tests/test_notifications.py tests/test_members_search.py -q` if you want to confirm Tasks 1-2 stay green.

- [ ] **Step 9: Commit**

```bash
git add backend/app/modules/identity/ backend/app/deps.py backend/app/main.py backend/tests/test_auth.py
git commit -m "feat(auth): must_change gate, change-password endpoint, JWT claim"
```

---

### Task 4: must_change frontend wiring (Bug 11, frontend)

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`ApiError.code` + event dispatch)
- Modify: `apps/web/src/lib/types.ts` (`TokenResponse.must_change`, `MeOut.must_change`)
- Modify: `apps/web/src/lib/auth.tsx` (state, listener, login branch, context)
- Create: `apps/web/src/app/change-password/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx:23-24`
- Modify: `apps/web/src/app/(app)/layout.tsx:197-218`

- [ ] **Step 1: ApiError.code + must-change event**

In `apps/web/src/lib/api.ts`, add a getter on `ApiError` (handles both `{detail:{error:{...}}}` and top-level `{error:{...}}` shapes):

```ts
  get code(): string | undefined {
    const d = this.detail as
      | { error?: { code?: string }; code?: string }
      | string
      | null;
    if (d && typeof d === "object") return d.error?.code ?? d.code;
    return undefined;
  }
```

In the fetch error path where `ApiError` is thrown (around line 86), change to dispatch before throwing:

```ts
    const apiError = new ApiError(res.status, detail);
    if (apiError.code === "MUST_CHANGE_PASSWORD") {
      window.dispatchEvent(new Event("auth:must-change"));
    }
    throw apiError;
```

- [ ] **Step 2: Types**

In `apps/web/src/lib/types.ts`, on `TokenResponse` add `must_change?: boolean;` and on `MeOut` add `must_change?: boolean;`.

- [ ] **Step 3: AuthProvider**

In `apps/web/src/lib/auth.tsx`:

1. Context interface additions:

```ts
interface AuthContextValue {
  me: MeOut | null;
  loading: boolean;
  mustChange: boolean;
  login: (email: string, password: string) => Promise<MeOut | null>;
  logout: () => Promise<void>;
  refreshMe: (
    data?: MeOut | ((prev: MeOut | null) => MeOut | null),
  ) => Promise<void>;
  completePasswordChange: (tokens: TokenResponse) => Promise<void>;
}
```

2. In `AuthProvider`, after `const [loading, setLoading] = useState(true);`:

```ts
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    const handler = () => setMustChange(true);
    window.addEventListener("auth:must-change", handler);
    return () => window.removeEventListener("auth:must-change", handler);
  }, []);
```

3. `login` — after `setTokens(tokens)` insert:

```ts
    if (tokens.must_change) {
      setMustChange(true);
      setMe(null);
      setLoading(false);
      return null;
    }
```
(the `/auth/me` fetch below only runs for unflagged logins)

4. Add the completion callback (near `logout`):

```ts
  const completePasswordChange = useCallback(
    async (tokens: TokenResponse) => {
      setTokens(tokens);
      setMustChange(false);
      await loadMe();
    },
    [loadMe],
  );
```

5. Provider value:

```tsx
    <AuthContext.Provider
      value={{ me, loading, mustChange, login, logout, refreshMe, completePasswordChange }}
    >
```

- [ ] **Step 4: Login page branch**

In `apps/web/src/app/login/page.tsx`, replace lines 23-24:

```ts
      const me = await login(email, password);
      router.push(!me ? "/change-password" : me.is_platform ? "/platform" : "/");
```

- [ ] **Step 5: Forced change-password screen**

Create `apps/web/src/app/change-password/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";
import type { TokenResponse } from "@/lib/types";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { completePasswordChange, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const tokens = await apiFetch<TokenResponse>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      await completePasswordChange(tokens);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.detail as { error?: { message?: string } } | null;
        setError(detail?.error?.message ?? "Could not change password.");
      } else {
        setError("Could not reach the server. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <p className="kicker mb-1">One-time step</p>
          <h1 className="font-display text-[26px] font-bold tracking-[0.16em]">CHANGE PASSWORD</h1>
          <p className="mt-2 text-[13px] text-ink-soft">
            Your account requires a password change before you can continue.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            id="current-password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            aria-label="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="w-full rounded-xl border border-line bg-fill px-3.5 py-2.5 text-[14px] outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          />
          <input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            aria-label="New password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-xl border border-line bg-fill px-3.5 py-2.5 text-[14px] outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          />
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-xl border border-line bg-fill px-3.5 py-2.5 text-[14px] outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          />
          {error && <p className="text-[13px] text-red">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Set new password"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => void logout().then(() => router.push("/login"))}
          className="w-full text-center text-[13px] text-ink-faint hover:text-ink"
        >
          Use a different account
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: App layout redirect**

In `apps/web/src/app/(app)/layout.tsx`, destructure `mustChange` from `useAuth()` (line 197) and replace the redirect effect (lines 216-218):

```ts
  useEffect(() => {
    if (loading) return;
    if (mustChange) router.replace("/change-password");
    else if (!me) router.replace("/login");
  }, [loading, me, mustChange, router]);
```

- [ ] **Step 7: Gates + live smoke**

```bash
cd apps/web && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22
```

Manual Chrome smoke (use an isolated context page):
1. Log in `mramitdas99@gmail.com` / `evolve-import-2026` → must land on `/change-password`, sidebar never appears.
2. Try navigating to `/` → redirected back to `/change-password`.
3. Submit wrong current password → red error, stays on page.
4. Submit `evolve-import-2026` as current AND new (same value) → lands on `/` (Evolve Gym dashboard), flag cleared.
5. Log out, log in again with `evolve-import-2026` → normal direct access (no forced screen).

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/change-password/page.tsx" apps/web/src/lib/api.ts apps/web/src/lib/types.ts apps/web/src/lib/auth.tsx "apps/web/src/app/login/page.tsx" "apps/web/src/app/(app)/layout.tsx"
git commit -m "feat(web): forced change-password screen + 403 must-change interception"
```

---

### Task 5: Revenue week chart renders (Bug 1)

**Files:**
- Modify: `apps/web/src/app/(app)/page.tsx:375-387` (`RevenueCard`)

- [ ] **Step 1: Fix bar geometry**

In `RevenueCard`, replace the bar container block:

```tsx
          <div className="mt-4 flex h-40 items-end gap-3">
            {bars.map((b) => (
              <div key={b.d} className="group flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    title={inr(b.amount)}
                    className="w-full rounded-md bg-gradient-to-t from-accent-deep to-accent transition-all duration-200 group-hover:from-accent-deep group-hover:to-accent-hover group-hover:shadow-[0_0_18px_var(--color-glow-strong)]"
                    style={{ height: `${Math.max(4, b.v)}%` }}
                  />
                </div>
                <span className="text-[11px] text-ink-faint">{b.d}</span>
              </div>
            ))}
          </div>
```

with:

```tsx
          <div className="mt-4 flex h-40 items-end gap-3">
            {bars.map((b) => (
              <div key={b.d} className="group flex flex-1 flex-col items-center gap-2">
                <div className="flex h-[136px] w-full items-end">
                  <div
                    title={inr(b.amount)}
                    className="w-full rounded-md bg-gradient-to-t from-accent-deep to-accent transition-all duration-200 group-hover:from-accent-deep group-hover:to-accent-hover group-hover:shadow-[0_0_18px_var(--color-glow-strong)]"
                    style={{ height: `${Math.max(2, Math.round((b.v / 100) * 136))}px` }}
                  />
                </div>
                <span className="text-[11px] text-ink-faint">{b.d}</span>
              </div>
            ))}
          </div>
```

The wrapper now has a definite `h-[136px]` and the bar gets an explicit px height (`b.v` is already 0-100 normalized against the week max), so every nonzero day paints ≥2px and the tallest day paints 136px.

- [ ] **Step 2: Gate + visual smoke**

```bash
cd apps/web && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
```

Chrome smoke: owner dashboard → evaluate bars:

```js
() => [...document.querySelectorAll('main [title^="₹"]')].map(el => el.getBoundingClientRect().height)
```

Expected: at least one height > 100 (tall day) and none equal 0 for days with collections (min 2px).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/page.tsx"
git commit -m "fix(web): paint revenue week bars with explicit pixel heights"
```

---

### Task 6: Billing truth — Outstanding/Overdue/Pay now (Bugs 6a, 6b, 8)

**Files:**
- Modify: `apps/web/src/lib/adapters.ts:228-236`
- Create: `apps/web/src/lib/adapters.test.ts`
- Modify: `apps/web/src/app/(app)/billing/page.tsx:66-74, 200-203`

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/src/lib/adapters.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toUiInvoice } from "./adapters";
import type { InvoiceOut } from "./types";

function invoice(overrides: Partial<InvoiceOut>): InvoiceOut {
  return {
    id: "inv-1",
    number: "INV-2026-000001",
    member_id: "mem-1",
    status: "open",
    issue_date: "2026-10-01",
    due_date: "2026-10-31",
    currency: "INR",
    lines: [],
    subtotal_minor: 100000,
    tax_minor: 0,
    total_minor: 100000,
    paid_minor: 0,
    ...overrides,
  } as InvoiceOut;
}

test("past-due partial invoice derives as overdue", () => {
  const ui = toUiInvoice(invoice({ status: "partial", due_date: "2024-01-01", paid_minor: 50000 }));
  assert.equal(ui.status, "overdue");
});

test("future-due partial invoice stays open", () => {
  const ui = toUiInvoice(invoice({ status: "partial", due_date: "2099-01-01" }));
  assert.equal(ui.status, "open");
});

test("past-due open invoice derives as overdue", () => {
  const ui = toUiInvoice(invoice({ status: "open", due_date: "2024-01-01" }));
  assert.equal(ui.status, "overdue");
});

test("void stays void regardless of due date", () => {
  const ui = toUiInvoice(invoice({ status: "void", due_date: "2024-01-01" }));
  assert.equal(ui.status, "void");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npm test`
Expected: FAIL on `past-due partial invoice derives as overdue` (gets `"open"`).

- [ ] **Step 3: Fix the adapter**

In `apps/web/src/lib/adapters.ts`, in `toUiInvoice`, replace:

```ts
  else if (i.status === "open" && new Date(i.due_date).getTime() < now) status = "overdue";
```

with:

```ts
  else if (
    (i.status === "open" || i.status === "partial") &&
    new Date(i.due_date).getTime() < now
  )
    status = "overdue";
```

- [ ] **Step 4: Fix billing page filters**

In `apps/web/src/app/(app)/billing/page.tsx` `SummaryCards` (lines 66-75), replace:

```ts
  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((a, i) => a + (i.total - i.paid), 0);
```

with:

```ts
  const outstanding = invoices
    .filter((i) => i.status === "open" || i.status === "overdue")
    .reduce((a, i) => a + (i.total - i.paid), 0);
```

(`overdue` filter on `i.status === "overdue"` at line 72-74 stays as-is.)

Pay-now gating (line 200): replace `{i.status !== "paid" && can("billing.payments.capture") && (` with `{(i.status === "open" || i.status === "overdue") && can("billing.payments.capture") && (`.

- [ ] **Step 5: Run tests + gate**

Run: `cd apps/web && npm test && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`
Expected: all pass (unit 3→7).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/adapters.ts apps/web/src/lib/adapters.test.ts "apps/web/src/app/(app)/billing/page.tsx"
git commit -m "fix(billing): outstanding excludes void, partial goes overdue, void hides Pay now"
```

---

### Task 7: Toast truth — plans, member-detail, check-ins (Bugs 6, 7)

**Files:**
- Modify: `apps/web/src/app/(app)/plans/page.tsx` (toast state + render line 633 + `addPlan` catch)
- Modify: `apps/web/src/app/(app)/members/[id]/page.tsx` (`checkInNow`, toast state + render line 691)
- Modify: `apps/web/src/app/(app)/checkins/page.tsx` (`doCheckin`, toast state + render line 246)

- [ ] **Step 1: Plans — typed toast (all 12 sites)**

In `apps/web/src/app/(app)/plans/page.tsx`, change line 81:

```ts
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
```

Replace every `setToast(...)` call with the explicit typed form (line numbers for anchoring):

| Line | Old | New |
|------|-----|-----|
| 130 | `` setToast(`Subscription created for ${member?.name ?? "member"} · ${inr(total)} due`) `` | `setToast({ type: "success", message: \`Subscription created for ${member?.name ?? "member"} · ${inr(total)} due\` })` |
| 132 | `setToast("Could not create subscription")` | `setToast({ type: "error", message: "Could not create subscription" })` |
| 154 | `setToast("Plan created")` | `setToast({ type: "success", message: "Plan created" })` |
| 156 | `setToast(planError(err, "create"))` | `setToast({ type: "error", message: planError(err, "create") })` |
| 195 | `setToast("Plan updated")` | `setToast({ type: "success", message: "Plan updated" })` |
| 197 | `setToast(planError(err, "update"))` | `setToast({ type: "error", message: planError(err, "update") })` |
| 204 | `` setToast(`${p.name} enabled`) `` | `setToast({ type: "success", message: \`${p.name} enabled\` })` |
| 206 | `setToast("Could not enable plan")` | `setToast({ type: "error", message: "Could not enable plan" })` |
| 217 | `` setToast(`${disableTarget.name} disabled · no longer sold`) `` | `setToast({ type: "success", message: \`${disableTarget.name} disabled · no longer sold\` })` |
| 220 | `setToast("Could not disable plan")` | `setToast({ type: "error", message: "Could not disable plan" })` |
| 228 | `` setToast(`${deleteTarget.name} deleted`) `` | `setToast({ type: "success", message: \`${deleteTarget.name} deleted\` })` |
| 231 | `setToast("Could not delete plan")` | `setToast({ type: "error", message: "Could not delete plan" })` |

Render (line 633) becomes:

```tsx
{toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
```

- [ ] **Step 2: Member detail — typed toast + denied color**

In `apps/web/src/app/(app)/members/[id]/page.tsx`:

- Line 68: `const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);`
- Convert every `setToast("...")` to typed form — **success messages** (lines 160, 170, 191, 216, 226, 247, 260) get `{ type: "success", message: ... }`; **failure messages** (lines 162, 172, 182, 193, **218** (`Camera unavailable — upload a photo instead` — currently renders green!), 228, 249, 262) get `{ type: "error", message: ... }`. Line 170's template stays a success (toggle worked).
- `checkInNow` (lines 267-281) success branch becomes:

```ts
      setToast({
        type: result.result === "allowed" ? "success" : result.result === "duplicate" ? "info" : "error",
        message:
          result.result === "allowed"
            ? `${member.name} checked in`
            : `Check-in ${result.result} · ${result.reason ?? ""}`,
      });
```

  and its `catch` (line 280) → `setToast({ type: "error", message: "Could not check in" })`.
- Render (line 691): `{toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}`

- [ ] **Step 3: Check-ins — API reason + outcome colors**

In `apps/web/src/app/(app)/checkins/page.tsx`:

- Toast state (line 88) becomes `{ type: "success" | "error" | "info"; message: string } | null`.
- In `doCheckin` success branch (lines 126-136), replace `setToast(...)` with:

```ts
      const message = `${member.full_name || member.first_name} — ${
        outcome === "granted"
          ? "access granted"
          : outcome === "denied"
            ? `access denied (${res.reason ?? "no active membership"})`
            : `duplicate check-in${res.reason ? ` · ${res.reason}` : ""}`
      }`;
      setToast({
        type: outcome === "granted" ? "success" : outcome === "denied" ? "error" : "info",
        message,
      });
```

- Catch → `setToast({ type: "error", message: "Check-in failed — could not reach the server" })`.
- Render (line 246): `{toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}`

- [ ] **Step 4: Also remove the dashboard heuristic**

In `apps/web/src/app/(app)/page.tsx` quick check-in (lines 75-95): the toast state there is already typed — update the denied message to use the API reason:

```ts
        message: `${name} — ${
          outcome === "granted"
            ? "access granted"
            : outcome === "denied"
              ? `access denied (${res.reason ?? "no active membership"})`
              : "duplicate check-in"
        }`,
```

(`res` is the mutation result — rename the destructured binding if it is currently called something else, keeping the same fields `result`/`reason`.)

- [ ] **Step 5: Gates + smoke**

```bash
cd apps/web && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
```

Chrome smoke (owner): create plan with existing slug → error toast must have **red** dot; member detail check-in on inactive member → **red** toast with API reason text.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/plans/page.tsx" "apps/web/src/app/(app)/members/[id]/page.tsx" "apps/web/src/app/(app)/checkins/page.tsx" "apps/web/src/app/(app)/page.tsx"
git commit -m "fix(web): explicit toast outcomes + API check-in denial reasons"
```

---

### Task 8: Perm-gated pollers + settings fetch (Bug 9) — GATE MANDATORY

**Files:**
- Modify: `apps/web/src/lib/hooks.ts` (`useNotificationsData` lines 548-573, `useGymSettings` line ~986)

- [ ] **Step 1: Gate notification queries**

In `useNotificationsData`, add the permission gate (hooks.ts already imports `useCan`):

```ts
export function useNotificationsData(): {
  notifications: Notification[];
  unread: number;
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const enabled = can("notifications.view");
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<NotificationOut[]>("/notifications"),
    staleTime: 0,
    enabled,
  });
  const unreadQ = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => apiFetch<{ count: number }>("/notifications/unread-count"),
    staleTime: 0,
    enabled,
  });
  ...
```

(rest unchanged — `isLoading` computes false for disabled queries in React Query v5, so no skeleton hangs.)

- [ ] **Step 2: Gate settings query**

In `useGymSettings` (line ~986):

```ts
export function useGymSettings(): {
  settings: GymSettingsOut | null;
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<GymSettingsOut>("/settings"),
    retry: false,
    enabled: can("tenancy.settings.manage"),
  });
```

- [ ] **Step 3: tsc + GATE (shared files!)**

```bash
cd apps/web && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
```
Expected: tsc clean; gate **22/22**.

- [ ] **Step 4: Console smoke**

Chrome: open an isolated platform-admin session (`admin@gym-erp.dev`) on `/platform` → console must show **zero** 403 requests for `/notifications*` or `/settings`. Switch to owner → bell badge still shows unread count.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/hooks.ts
git commit -m "fix(web): skip notification/settings queries when role lacks the permission"
```

---

### Task 9: Double-submit guards (Bug 3)

**Files:**
- Create: `apps/web/src/lib/inflight.ts`
- Modify: `apps/web/src/app/(app)/members/page.tsx:61,93-118,343`
- Modify: `apps/web/src/app/(app)/plans/page.tsx` (`addPlan` line 136, button line 517; `subscribePlan` line 116; `saveEdit` line 175 + button 592)
- Modify: `apps/web/src/app/(app)/expenses/page.tsx` (`confirmAdd` line 78, button line 224)
- Modify: `apps/web/src/app/(app)/checkins/page.tsx` (`doCheckin`, submit button line 222)
- Modify: `apps/web/src/app/(app)/page.tsx` (dashboard quick check-in, `busy` at line ~213 usage)
- Modify: `apps/web/src/app/(app)/billing/page.tsx` (`confirmPay` line 136, Pay button line 278)

- [ ] **Step 1: Create the helper**

Create `apps/web/src/lib/inflight.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Synchronous double-submit guard. `busy` drives disabled states; the ref
 * rejects re-entry within the same tick, before React re-renders.
 */
export function useInFlight(): { busy: boolean; run: (fn: () => Promise<void>) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
```

- [ ] **Step 2: Apply — Add member**

In `members/page.tsx`: remove `const [submitting, setSubmitting] = useState(false);` (line 61), add `import { useInFlight } from "@/lib/inflight";` and `const addGuard = useInFlight();` near the other hooks, and replace `addMember` (lines 93-118) with:

```ts
  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    const nameParts = form.name.trim().split(/\s+/);
    if (!nameParts[0]) return;
    await addGuard.run(async () => {
      try {
        const created = await createMember.mutateAsync({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(" ") || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          country_code: form.countryCode || undefined,
          gender: form.gender,
          branch_id: form.branchId,
          status: "lead",
        });
        if (form.planId) {
          const sub = await subscribe.mutateAsync({
            member_id: created.id,
            plan_id: form.planId,
            branch_id: form.branchId,
          });
          await activate.mutateAsync(sub.id);
        }
        setOpen(false);
        setToast(`${form.name.trim()} added as lead`);
        setForm({ name: "", email: "", countryCode: "+91", phone: "", gender: "Male", branchId: form.branchId, planId: "" });
      } catch {
        setToast("Failed to add member");
      }
    });
  }
```

Button (line 343): `disabled={addGuard.busy}` and label `{addGuard.busy ? "Adding…" : "Add member"}`. (The toast state/render in this file stays exactly as-is — it is not in the bug scope.)

- [ ] **Step 3: Apply — plans**

In `plans/page.tsx` add `import { useInFlight } from "@/lib/inflight";` plus `const addGuard = useInFlight();` and `const editGuard = useInFlight();`:

- `addPlan` (line 136): after `const dur = durationFor(planForm.durationMonths);` wrap the rest:

```ts
    await addGuard.run(async () => {
      try {
        await createPlan.mutateAsync({
          name: planForm.name,
          slug: planForm.slug || autoSlug(planForm.name, planForm.branchId ? branchName(planForm.branchId) : ""),
          branch_id: planForm.branchId || null,
          description: planForm.description || undefined,
          billing_period: dur.period,
          amount_minor: Number(planForm.amountMinor),
          entry_fee_minor: Number(planForm.entryFeeMinor),
          tax_rate_bp: Math.round(Number(planForm.taxPercent) * 100),
          duration_months: dur.months,
          auto_renew: planForm.autoRenew,
        });
        setCreateOpen(false);
        setPlanForm(emptyForm);
        setToast({ type: "success", message: "Plan created" });
      } catch (err) {
        setToast({ type: "error", message: planError(err, "create") });
      }
    });
```

  (toast typed as part of Task 7 — if Task 7 ran first, the setToast lines already have types; keep them.) Create-plan button (line 517): `disabled={addGuard.busy || createPlan.isPending}`.

- `subscribePlan` (line 116): after the `if (!selected || ...) return;` guard, wrap the rest in `await addGuard.run(async () => { ... })` (same try/catch, typed toasts from Task 7). Its submit button gets `disabled={addGuard.busy || subscribe.isPending}`.

- `saveEdit` (line 175): after `const dur = durationFor(editForm.durationMonths);`, wrap the rest in `await editGuard.run(async () => { ...existing try/catch with typed toasts... });`. Edit-save button (line 592): `disabled={editGuard.busy || updatePlan.isPending}`.

- [ ] **Step 4: Apply — expenses, check-ins, dashboard, payment**

- `expenses/page.tsx`: `const addGuard = useInFlight();` — wrap `confirmAdd` body; button line 224: `disabled={addGuard.busy || createExpense.isPending}`.
- `checkins/page.tsx`: `const checkGuard = useInFlight();` — wrap `doCheckin` body; submit button line 222: `disabled={!member || checkGuard.busy}`.
- `(app)/page.tsx` dashboard quick check-in: replace the `busy` state with `const checkGuard = useInFlight();` (or, if `busy` is also used for other UI, keep it but ALSO wrap the handler body in `checkGuard.run`); button uses `checkGuard.busy`.
- `billing/page.tsx`: `const payGuard = useInFlight();` — wrap `confirmPay` body; Pay button line 278: `disabled={payGuard.busy}`.

- [ ] **Step 5: Gate + live double-click proof**

```bash
cd apps/web && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
```

Chrome (owner): open Add member, fill name `"Guard Probe"`, click **Add member** 3× synchronously:

```js
() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'Add member');
  btn.click(); btn.click(); btn.click();
}
```

Then close modal → search members for `"Guard Probe"` → **exactly 1** result. Delete the probe member (cleanup).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/inflight.ts "apps/web/src/app/(app)/members/page.tsx" "apps/web/src/app/(app)/plans/page.tsx" "apps/web/src/app/(app)/expenses/page.tsx" "apps/web/src/app/(app)/checkins/page.tsx" "apps/web/src/app/(app)/page.tsx" "apps/web/src/app/(app)/billing/page.tsx"
git commit -m "fix(web): synchronous in-flight guards on all mutation forms"
```

---

### Task 10: Accessibility pass — GATE (touches `(app)/layout.tsx`)

**Files:**
- Modify: `apps/web/src/components/ui.tsx` (Toast root + close button, Modal close button line ~336)
- Modify: `apps/web/src/app/(app)/layout.tsx` (theme toggle line 171, sign-out line 358)
- Modify: `apps/web/src/app/login/page.tsx`, `(app)/members/page.tsx`, `(app)/plans/page.tsx`, `(app)/expenses/page.tsx`, `(app)/checkins/page.tsx`, `(app)/billing/page.tsx`, `(app)/settings/page.tsx` (inputs)

- [ ] **Step 1: Toast + modal**

In `ui.tsx` `Toast`: outer wrapper `<div className="fixed bottom-6 ...">` → add `role="status" aria-live="polite"`; close button (line ~379) → `aria-label="Dismiss"`. In `Modal` (line ~336 close button) → `aria-label="Close"`.

- [ ] **Step 2: Layout icon-only buttons**

In `(app)/layout.tsx`: theme toggle (line 171, has `title=`) → add `aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}`; sign-out (line 358, `title="Sign out"`) → `aria-label="Sign out"`.

- [ ] **Step 3: Inputs — id/name/label**

For each input below, add `id`, `name`, and `aria-label` (label text = shown placeholder/field name). Anchor by placeholder:

| File | Inputs (anchor by placeholder) |
|------|-------------------------------|
| `login/page.tsx` | `Email`, `Password` → ids `login-email`, `login-password` |
| `members/page.tsx` | `Search name, email, phone` (`member-search`), `e.g. Aisha Kapoor` (`member-name`), `aisha@example.com` (`member-email`), `90000 00000` (`member-phone`) |
| `plans/page.tsx` | `e.g. Monthly Flex` (`plan-name`), slug input (`plan-slug`), `What's included` (`plan-description`), `e.g. 150000` (`plan-amount`), `0` (`plan-entry-fee`), `e.g. 18` (`plan-tax`) |
| `expenses/page.tsx` | `25000` (`expense-amount`), `Optional note` (`expense-description`) + selects `Category`/`Method`/date → `expense-category`, `expense-method`, `expense-paid-at` |
| `checkins/page.tsx` | `Search member…` (`checkin-member-search`) |
| `billing/page.tsx` | `Search invoice # or member` (`billing-search`) |

Example edit:

```tsx
              <input
                type="email"
                id="login-email"
                name="login-email"
                aria-label="Email"
                placeholder="Email"
```

Settings page: it renders inputs without placeholders — associate each existing `<label>` with its input via matching `htmlFor`/`id` pairs (read the file; for every `<label>`+input pair add `id` to the input equal to `htmlFor`). Add `name` attributes matching the ids.

- [ ] **Step 4: tsc + GATE**

```bash
cd apps/web && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
```
Expected: gate **22/22**.

- [ ] **Step 5: a11y console spot-check**

Chrome on owner `/members` and `/login`: run Lighthouse snapshot or check console — the two unlabeled-input issues from QA must be gone; `document.querySelectorAll('button[title]:not([aria-label])')` → 0 matches on `/` header area.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui.tsx "apps/web/src/app/(app)/layout.tsx" apps/web/src/app/login/page.tsx "apps/web/src/app/(app)/members/page.tsx" "apps/web/src/app/(app)/plans/page.tsx" "apps/web/src/app/(app)/expenses/page.tsx" "apps/web/src/app/(app)/checkins/page.tsx" "apps/web/src/app/(app)/billing/page.tsx" "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "fix(web): labels, aria-labels, and role=status on toasts"
```

---

### Task 11: Pagination — expenses server-side + revenue client-side — GATE (platform page)

**Files:**
- Modify: `apps/web/src/lib/hooks.ts` (new `useExpensesPage`; keep `useExpensesData` for `SummaryCards`)
- Modify: `apps/web/src/app/(app)/expenses/page.tsx` (list component lines 57+)
- Modify: `apps/web/src/app/(app)/platform/revenue/page.tsx` (`SoldList` lines 67-111)

- [ ] **Step 1: Expenses page hook**

In `hooks.ts`, next to `useExpensesData`, add:

```ts
export function useExpensesPage(params: { page: number; pageSize: number }): {
  expenses: ExpenseOut[];
  total: number;
  isLoading: boolean;
  isError: boolean;
} {
  const can = useCan();
  const q = useQuery({
    queryKey: ["expenses", "page", params],
    queryFn: () => {
      const sp = new URLSearchParams({
        page: String(params.page),
        page_size: String(params.pageSize),
      });
      return apiFetch<PageOut<ExpenseOut>>(`/expenses?${sp.toString()}`);
    },
    placeholderData: keepPreviousData,
    enabled: can("expenses.view"),
  });
  const page = q.data ?? { items: [] as ExpenseOut[], total: 0 };
  return {
    expenses: page.items,
    total: page.total ?? page.items.length,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
```

(`PageOut`, `keepPreviousData`, `ExpenseOut` already imported in hooks.ts.)

- [ ] **Step 2: Expenses list pagination**

In `expenses/page.tsx`, in the `ExpensesPage` component (line 57):

```ts
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const { expenses, total, isLoading, isError } = useExpensesPage({ page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
```

Keep the client `sort` on the current page's items. Reset page when needed (simplest: none — page 1 is fine default). Add a pager directly under the table, copying the members pattern:

```tsx
        <div className="flex items-center justify-between px-5 py-3 text-[13px] text-ink-faint">
          <span>
            Page {page} of {totalPages}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </span>
        </div>
```

(`Button` already imported in this file — verify; add to the `@/components/ui` import if not.) Also clamp: if `page > totalPages` after data arrives, `useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);`.

Leave `SummaryCards` on `useExpensesData` (it needs the full set for totals).

- [ ] **Step 3: Revenue sold-list pagination (frozen surface, user-approved)**

In `platform/revenue/page.tsx` `SoldList`:

```tsx
function SoldList({ sold }: { sold: SoldSubscriptionOut[] }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(sold.length / pageSize));
  const visible = sold.slice((page - 1) * pageSize, page * pageSize);
```

- Render `visible.map(...)` instead of `sold.map(...)`.
- After `</table>`, before `{sold.length === 0 && ...}`:

```tsx
      {sold.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-faint">
          <span>
            Page {page} of {totalPages} · {sold.length} total
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </span>
        </div>
      )}
```

Add imports: `useState` from react, `Button` from `@/components/ui`.

- [ ] **Step 4: tsc + GATE**

```bash
cd apps/web && npx tsc --noEmit && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
```
Expected: gate **22/22**.

- [ ] **Step 5: Chrome smoke**

Owner `/expenses` → 20 rows, `Page 1 of 3` (58 total), Next works. Platform `/platform/revenue` → subscriptions table paginates at 20 with total shown; chart unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/hooks.ts "apps/web/src/app/(app)/expenses/page.tsx" "apps/web/src/app/(app)/platform/revenue/page.tsx"
git commit -m "feat(web): server pagination for expenses, client pagination for revenue sold list"
```

---

### Task 12: e2e coverage for the fixes

**Files:**
- Modify: `apps/web/e2e/frontdesk_verify.cjs` (void Pay-now check, after line 222)
- Modify: `apps/web/e2e/gym_ops_verify.cjs` (mark-all check, after line 362)

- [ ] **Step 1: Void hides Pay now**

In `frontdesk_verify.cjs`, right after the `invoice B voided via detail UI` check (line 221-222), add:

```js
    const voidPayNow = voidRow.first().getByRole("button", { name: "Pay now" });
    check(
      "billing: void invoice shows no Pay now button",
      (await voidPayNow.count()) === 0,
      invBOpen.number,
    );
```

- [ ] **Step 2: Mark-all e2e**

In `gym_ops_verify.cjs`, after the single mark-read toast check (line 362), add:

```js
    await page.getByRole("button", { name: /mark all read/i }).click();
    await must(
      "notifications: mark-all clears every remaining unread dot",
      page
        .locator("button", { hasText: "Payment received" })
        .locator("span.bg-accent")
        .first()
        .waitFor({ state: "detached", timeout: 15000 }),
    );
    check("notifications: mark-all button reachable", true, "mark-all clicked");
```

- [ ] **Step 3: Run both scripts (sequential)**

```bash
cd apps/web
NODE_PATH="$(npm root -g)" node e2e/frontdesk_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs
```
Expected: frontdesk 23/23 (22 + 1 new), gym_ops 30/30 (28 + 2 new: one `must`, one `check`). If gym_ops' mark-all flake-risk appears (a new payment notification landing mid-wait), retry once — deliveries are async outbox.

- [ ] **Step 4: Commit**

```bash
git add e2e/frontdesk_verify.cjs e2e/gym_ops_verify.cjs
git commit -m "test(e2e): cover void Pay-now hiding and notifications mark-all"
```

---

### Task 13: Full automated battery

- [ ] **Step 1: Run everything sequentially**

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts
cd ../apps/web && npx tsc --noEmit && npm test
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/plans_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/member_account_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/role_visibility_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/frontdesk_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs
NODE_PATH="$(npm root -g)" node e2e/expenses_verify.cjs
```

Expected: pytest **72 passed** · ruff clean · tsc 0 · unit **7** pass · gate 22/22 · plans 9/9 · member_account 13/13 · role_visibility 18/18 · frontdesk 23/23 · gym_ops 30/30 · expenses 13/13. If any script fails due to a stray test artifact, clean the artifact (via UI/API) and re-run that script — never skip.

- [ ] **Step 2: Record results**

Note the exact counts in the task summary for the final report.

---

### Task 14: Per-role Chrome DevTools QA (every role × every functionality)

Use isolated contexts (one per role, e.g. `qa-platform`, `qa-owner`, `qa-evolve`, `qa-manager`, `qa-receptionist`, `qa-trainer`). Fresh login per context. Work through every checklist block below; **any failure = stop and fix before continuing** (small fixes committed as their own commits; re-run gate if shared files were touched). Clean up all mutations afterward, leave theme **dark**.

- [ ] **Platform (`admin@gym-erp.dev` / `admin-pass-123`)**
  - `/platform` overview: stats + revenue chart render; **console has ZERO 403s** (Bug 9).
  - Gyms: list, create probe gym, edit, delete probe gym.
  - Owners: list + open owner detail.
  - Subscriptions: tier cards render; tier CRUD (create + delete probe tier).
  - Revenue: MoM chart renders; **sold list shows 20 rows + pager (Bug: pagination)**; Page 2 works.
  - Theme toggle light→dark (leave dark), header date/health dot.
  - Attempt `/members` → redirected (platform panel boundary).

- [ ] **Owner (`demo-owner@gym-erp.dev` / `owner-pass-123`)**
  - Dashboard: stats; **week chart bars have visible pixel heights** (Bug 1); quick check-in grant + deny (deny color red, reason from API — Bug 7).
  - Members: pagination, filters, **multi-word search "First Last" finds the member** (Bug 2); Add member ×3 sync clicks → **1 created** (Bug 3); member detail timeline/edit; check-in from detail (denied → red toast — Bug 6); deleted-member 404 state; XSS name renders escaped.
  - Check-ins: check-in grant/denied/duplicate — three distinct toast colors + **real API reason text** (Bug 7).
  - Plans: create (success toast), **duplicate slug → RED toast** (Bug 6); edit/enable/disable/delete; subscribe member to plan.
  - Billing: **Outstanding excludes voids** (cross-check: void invoices' totals not included — Bug 4/6a); **Overdue includes past-due partial** if present (Bug 10); **void row has no Pay now** (Bug 8); open row Pay now → pay modal → pay succeeds (single payment only — guard).
  - Expenses: list paginates at 20; add expense; delete expense; **add expense double-click → 1 row**.
  - Branches: create/edit probe branch, delete it.
  - Subscriptions (tenant): own tier view.
  - Roles: create probe role, edit permissions, delete (ARIA header intact).
  - Settings: save gym profile (typed success toast); timezone round-trip.
  - Notifications: **Mark all read clears badge to 0 and stuck count gone** (Bug 5); single mark-read; bell badge hidden when 0.
  - a11y spot: `/members` + `/login` console — no unlabeled-input issues; Toast dismiss has aria-label.
  - Light + dark both sane on dashboard.

- [ ] **Evolve (`mramitdas99@gmail.com` / `evolve-import-2026`)**
  - Login goes **straight through** (flag cleared in Task 4) — no forced screen.
  - Scale: Members 560 → pagination fast, **multi-word search** on an imported name (find one with a space via API first: `GET /api/v1/members?page=1&page_size=1`).
  - Billing big list renders; dashboard chart at scale; expenses (58) paginate.

- [ ] **Manager (`branch-manager@gym-erp.dev` / `manager-pass-123`)**
  - Allowed modules (members, plans, check-ins, billing view) work; denied route `/roles` → guarded (pre-fetch, no 403 spam).
  - Console clean on dashboard + members.

- [ ] **Receptionist (`receptionist@gym-erp.dev` / `receptionist-pass-123`)**
  - Front desk flows: member create, check-in grant/deny (correct toasts), billing Pay now on open invoice.
  - Denied `/expenses` → guard fires, no 403.
  - **Double-submit probe: Add member ×3 → 1 created** (clean up).

- [ ] **Trainer (`trainer@gym-erp.dev` / `trainer-pass-123`)**
  - Plans page view-only gating (mutating buttons hidden/disabled).
  - Denied `/billing` → guard, no 403.
  - Check-ins module per trainer perms (records view).

- [ ] **Cross-cutting + cleanup**
  - XSS probe (create member with `<img src=x onerror=alert(1)>`-style name → renders escaped) then delete it.
  - Notifications fan-out: any notification created during QA gets mark-all'd.
  - Delete every probe entity created during this QA (gyms, tiers, roles, branches, members, expenses).
  - Active branch back to a sensible default (not a deleted probe branch) — verify dashboard loads.
  - Theme left **dark**; all isolated QA pages closed except none needed.
  - Record every failure found → fix as mini-tasks (TDD where backend, gate when shared) or, if out of the approved scope, log them for the user in the final report.

- [ ] **Final verification + report**

Re-run the complete battery from Task 13, then produce the final report:
1. Task 1–14 completion summary with commits.
2. Full battery numbers (pytest/ruff/tsc/unit/7 e2e).
3. Per-role QA matrix (role × module → pass) with notes.
4. Any deferred findings.
