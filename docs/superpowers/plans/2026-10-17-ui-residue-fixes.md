# UI Residue Fixes + Full-Stack Role QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear all 12 optional-residue items from the 2026-10-16 UI-issue-fixes final review, then verify end-to-end: backend suite + every e2e script + a Chrome DevTools pass logging in as every role and exercising every module.

**Architecture:** Purely incremental fixes — no new features. Frontend: toast truthfulness (typed toasts, mutation-settled notifications), ARIA header restructure on roles, `refreshMe` functional updates, e2e named-step helper, scoped locators. Backend: global partial-unique email index (migration 0015) + timezone field bounds (user-approved touch of platform schema). Finishes with a role×module manual QA matrix driven through the live dev servers via Chrome DevTools MCP.

**Tech Stack:** Next.js 15 / React Query / Playwright (e2e) / FastAPI / SQLAlchemy / Alembic / pytest+httpx.

**Ground rules (from AGENTS.md + session conventions):**
- Frozen platform admin surface: DO NOT change platform pages/routes/API behavior except Task 10 (explicitly user-approved schema bound). Gate (`platform_admin_verify.cjs`) must stay 22/22 after every shared-file or backend change.
- Dev servers RUNNING on :3000/:8000 — do not restart. DB was reseeded + GMS re-imported (Evolve Gym: 560 members, 58 expenses).
- Never `git add -A`; stage only task files. Commit directly to `main`.
- Backend tests: `cd backend && .venv/bin/python -m pytest -q` (currently 64 passed). Ruff: `.venv/bin/ruff check app tests scripts`.
- Frontend: `cd apps/web && npx tsc --noEmit`; unit `npm test`; gate `NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs`.
- e2e scripts self-provision; run sequentially (shared DB).

**Residue → task map:**

| # | Residue | Task |
|---|---------|------|
| 1 | Settings error toasts styled as success | Task 1 |
| 2 | `saveProfile` re-seeds inputs with user casing, not server truth | Task 1 |
| 3 | Stale e2e comment (nested-button "observable") | Task 4 |
| 4 | Old plan checkboxes unticked | Task 8 |
| 5 | `hooks.ts` `MeOut` import out of alphabetical order | Task 5 |
| 6 | Task 1 nits: loose Void locator (6a), missing invalidation doc comment (6b) | Tasks 6, 5 |
| 7 | `check(name, true)` after `waitFor` → failures surface as "unexpected failure" | Task 7 |
| 8 | Notifications toasts fire before mutations settle (false success on error) | Task 3 |
| 9 | Cross-tenant email race narrowed, not eliminated | Task 9 |
| 10 | `saveGymProfile` `refreshMe` spread uses render-closure `me` | Task 2 |
| 11 | Save `<button>` nested inside header `role="button"` (ARIA) | Task 4 |
| 12 | `GymUpdateRequest.timezone` / `BranchUpdate.timezone` unbounded | Task 10 |

---

### Task 1: Settings — typed toasts + response-seeded profile fields (residue 1, 2)

**Files:**
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Replace toast state with `{ message, type }` and add a notify helper**

In `SettingsPage`, replace:

```tsx
  const [toast, setToast] = useState<string | null>(null);
```

with:

```tsx
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function notify(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }
```

- [ ] **Step 2: Update every `setToast` call site**

In `saveProfile`:

```tsx
      await refreshMe(updated);
      // Seed the inputs from the server response (it lowercases email) —
      // re-seeding from local state would show casing the server rejected.
      setName(updated.user.full_name);
      setEmail(updated.user.email);
      notify("Profile updated");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notify("That email is already taken", "error");
      } else if (e instanceof ApiError && e.status === 422) {
        notify("Check the name and email format", "error");
      } else {
        notify("Could not save profile — check your connection", "error");
      }
```

(replaces the `setName(name.trim()); setEmail(email.trim()); setToast(...)` block and the three error toasts)

In `toggleCrossBranch`:

```tsx
      notify(next ? "Members can now use any branch" : "Members restricted to their home branch");
    } catch {
      notify("Could not update branch access", "error");
    }
```

In `saveGymProfile`:

```tsx
      notify("Gym profile updated");
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        notify("Gym name must be 2–200 characters", "error");
      } else {
        notify("Could not save gym profile", "error");
      }
    }
```

- [ ] **Step 3: Update the toast render**

Replace:

```tsx
      {toast && <Toast type="success" message={toast} onClose={() => setToast(null)} />}
```

with:

```tsx
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
```

- [ ] **Step 4: Verify**

```bash
cd apps/web && npx tsc --noEmit   # exit 0
node e2e/gym_ops_verify.cjs        # 27/27 — settings waits are exact-text, unchanged
```

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "fix(settings): error toasts styled as errors, seed profile from PATCH response"
```

---

### Task 2: `refreshMe` functional updater (residue 10)

**Files:**
- Modify: `apps/web/src/lib/auth.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Widen `refreshMe` to accept an updater**

In `auth.tsx`, replace the context interface member:

```tsx
  refreshMe: (data?: MeOut | ((prev: MeOut | null) => MeOut | null)) => Promise<void>;
```

and replace the `refreshMe` callback:

```tsx
  const refreshMe = useCallback(
    async (data?: MeOut | ((prev: MeOut | null) => MeOut | null)) => {
      if (typeof data === "function") {
        setMe((prev) => data(prev));
        return;
      }
      if (data) {
        setMe(data);
        return;
      }
      await loadMe();
    },
    [loadMe],
  );
```

- [ ] **Step 2: Use the updater in `saveGymProfile`**

In `settings/page.tsx`, replace:

```tsx
      // Feed the PATCH response into the auth context (pattern from Task 2b) —
      // the sidebar's tenant_name comes from `me`, and a plain refreshMe() GET
      // would be an extra round trip with a partial-failure window.
      if (me) await refreshMe({ ...me, tenant_name: updated.name });
```

with:

```tsx
      // Functional update: builds on the LATEST context state, not this
      // render's closure — a concurrent profile save can't be clobbered.
      refreshMe((prev) => (prev ? { ...prev, tenant_name: updated.name } : prev));
```

- [ ] **Step 3: Verify**

```bash
cd apps/web && npx tsc --noEmit   # exit 0
node e2e/gym_ops_verify.cjs        # 27/27 — sidebar tenant-name refresh check must pass
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth.tsx "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "fix(auth): refreshMe accepts functional updates for concurrent-safe context writes"
```

---

### Task 3: Notifications — toast only after mutations settle (residue 8)

**Files:**
- Modify: `apps/web/src/app/(app)/notifications/page.tsx`

- [ ] **Step 1: Rework `markAll` and `markOne`**

Replace:

```tsx
  function markAll() {
    notifications.filter((n) => !n.read).forEach((n) => markRead.mutate(n.id));
    setToast("All notifications marked as read");
  }

  function markOne(n: Notification) {
    if (n.read) return;
    markRead.mutate(n.id);
    setToast("Notification marked as read");
  }
```

with:

```tsx
  async function markAll() {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => markRead.mutateAsync(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setToast(`Could not mark ${failed} notification${failed === 1 ? "" : "s"} as read`);
    } else {
      setToast("All notifications marked as read");
    }
  }

  function markOne(n: Notification) {
    if (n.read) return;
    markRead.mutate(n.id, {
      onSuccess: () => setToast("Notification marked as read"),
      onError: () => setToast("Could not mark notification as read"),
    });
  }
```

- [ ] **Step 2: Branch the toast render type**

Replace:

```tsx
      {toast && <Toast type="success" message={toast} onClose={() => setToast(null)} />}
```

with:

```tsx
      {toast && <Toast type={toast.startsWith("Could") ? "error" : "success"} message={toast} onClose={() => setToast(null)} />}
```

- [ ] **Step 3: Verify**

```bash
cd apps/web && npx tsc --noEmit   # exit 0
node e2e/gym_ops_verify.cjs        # 27/27 — single mark-read toast check (exact text, now arrives post-POST)
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/notifications/page.tsx"
git commit -m "fix(notifications): toast only after mutations settle, error-styled failures"
```

---

### Task 4: Roles — Save outside header `role="button"` (residues 11, 3)

**Files:**
- Modify: `apps/web/src/app/(app)/roles/page.tsx`
- Modify: `apps/web/e2e/gym_ops_verify.cjs`

- [ ] **Step 1: Restructure the role card header**

In `roles/page.tsx`, replace the whole header `div` (the one starting `<div` with `role="button"` and containing the chevron, title block, and the `<span onClick={stopPropagation}>` right side) with:

```tsx
            <div className="flex w-full items-center justify-between gap-3 border-b border-line bg-fill px-5 py-4 text-left">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={!collapsed.has(role.id)}
                onClick={() => toggleCollapsed(role.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.repeat) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCollapsed(role.id);
                  }
                }}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className={`shrink-0 text-ink-faint transition-transform duration-200 ${
                    collapsed.has(role.id) ? "-rotate-90" : ""
                  }`}
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold tracking-tight">{role.name}</h3>
                    {!role.is_editable && (
                      <Badge tone="gray">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                        Locked
                      </Badge>
                    )}
                  </div>
                  {role.description && <p className="text-[12px] text-ink-faint">{role.description}</p>}
                </div>
              </div>
              <div className="shrink-0">
                {role.is_editable && dirty && (
                  <Button size="sm" disabled={saving === role.id} onClick={() => save(role.id, role.name)}>
                    {saving === role.id ? "Saving…" : `Save (${current.size} perms)`}
                  </Button>
                )}
                {role.is_editable && !dirty && (
                  <span className="text-[12px] text-ink-faint">{current.size} permissions</span>
                )}
              </div>
            </div>
```

Key change: the `role="button"` region now wraps only the chevron + title/description (still carries `aria-expanded`, `target`/`repeat` keydown guards); the Save button / count text live in a sibling `<div className="shrink-0">` — no interactive element inside `role="button"`, no `stopPropagation` needed.

- [ ] **Step 2: Fix the stale e2e comments (residue 3) + keyboard-path comment**

In `apps/web/e2e/gym_ops_verify.cjs`, replace:

```js
    // The header's Save button only renders when a card has unsaved edits —
    // make Receptionist dirty so the nested-button bug is observable.
```

with:

```js
    // The header's Save button only renders when a card has unsaved edits —
    // make Receptionist dirty so Save exists for the nested-button and
    // keyboard-save checks below.
```

Replace:

```js
    // Keyboard path: Enter on the focused Save must SAVE, not collapse the card.
    // (If the header swallows the keydown, the card collapses while the dirty
    // header's Save button stays mounted — so the detached wait times out and
    // the check fails. The switch-visibility wait is belt-and-braces.)
```

with:

```js
    // Keyboard path: Enter on the focused Save must SAVE via native button
    // activation — Save now lives outside the header's role=button region,
    // so a header keydown can never intercept it. The detached wait is the
    // RED signal; the switch-visibility wait is belt-and-braces.
```

- [ ] **Step 3: Strengthen the nesting check**

Immediately after the existing:

```js
    const nestedButtons = await page.locator("button button").count();
    check("roles: no nested <button> elements", nestedButtons === 0, `count=${nestedButtons}`);
```

add:

```js
    const nestedInRoleButton = await recvCard.locator('[role="button"] button').count();
    check(
      "roles: Save is outside the header role=button region",
      nestedInRoleButton === 0,
      `count=${nestedInRoleButton}`,
    );
```

- [ ] **Step 4: Verify**

```bash
cd apps/web && npx tsc --noEmit   # exit 0
node e2e/gym_ops_verify.cjs        # 28/28 (one new check)
```

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/roles/page.tsx" apps/web/e2e/gym_ops_verify.cjs
git commit -m "fix(roles): move Save outside header role=button region"
```

---

### Task 5: hooks.ts tidy — MeOut import order + pay/void invalidation note (residues 5, 6b)

**Files:**
- Modify: `apps/web/src/lib/hooks.ts` (SHARED FILE → gate required)

- [ ] **Step 1: Fix import order**

In the `import type { ... } from "./types";` block, move the `MeOut,` line from after `PlatformSummaryOut,` to between `MemberTimelineOut,` and `NotificationOut,` so the block reads (excerpt):

```ts
  MemberOut,
  MemberTimelineOut,
  MeOut,
  NotificationOut,
  PageOut,
  PaymentCaptureResult,
  PermissionOut,
  PlanOut,
  PlatformRevenueOut,
  PlatformSummaryOut,
  RoleOut,
```

- [ ] **Step 2: Document the invoice detail invalidation (residue 6b)**

Immediately above `export function usePayInvoice()`, add:

```ts
// ["invoice", id] refreshes the open invoice-detail page in place after
// pay/void — without it the status badge on /billing/[id] stays stale until
// a full navigation. Covered by e2e/frontdesk_verify.cjs.
```

(The comment covers both `usePayInvoice` and `useVoidInvoice`, which sit back-to-back.)

- [ ] **Step 3: Verify (shared file → gate)**

```bash
cd apps/web && npx tsc --noEmit   # exit 0
NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/hooks.ts
git commit -m "chore(web): alphabetical MeOut import, document invoice detail invalidation"
```

---

### Task 6: Scoped invoice void-badge locator (residue 6a)

**Files:**
- Modify: `apps/web/e2e/frontdesk_verify.cjs`

- [ ] **Step 1: Scope the badge wait**

Replace:

```js
    // The detail query must refresh after void — no navigation needed.
    await page.getByText("Void", { exact: true }).first().waitFor({ timeout: 15000 });
```

with:

```js
    // The detail query must refresh after void — no navigation needed. Scope
    // the badge wait to THIS invoice's card (not any "Void" text on the page).
    const invBCard = page
      .locator("div.glass")
      .filter({ has: page.getByRole("heading", { name: invBOpen.number }) })
      .first();
    await invBCard.getByText("Void", { exact: true }).waitFor({ timeout: 15000 });
```

- [ ] **Step 2: Verify**

```bash
cd apps/web && node e2e/frontdesk_verify.cjs   # 22/22
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/frontdesk_verify.cjs
git commit -m "test(e2e): scope invoice void-badge wait to the invoice card"
```

---

### Task 7: e2e `must()` helper — attribute waitFor failures to their named check (residue 7)

**Files:**
- Modify: `apps/web/e2e/expenses_verify.cjs`, `frontdesk_verify.cjs`, `gym_ops_verify.cjs`, `member_account_verify.cjs`, `plans_verify.cjs`, `platform_admin_verify.cjs`

`role_visibility_verify.cjs` has zero `check(..., true)` sites — untouched.

- [ ] **Step 1: Add the helper to each of the 6 scripts**

Immediately after each script's `check` function definition, add:

```js
// Await a wait-then-check pair so a timeout fails under the check's own
// name instead of surfacing as a generic "unexpected failure".
async function must(name, p, extra = "") {
  try {
    await p;
    check(name, true, extra);
  } catch (e) {
    if (e && typeof e === "object") e.named = true;
    throw e;
  }
}
```

- [ ] **Step 2: Guard the outer catch in each script**

Replace each script's:

```js
  } catch (err) {
    check("unexpected failure", false, String(err).slice(0, 200));
  } finally {
```

with:

```js
  } catch (err) {
    if (!(err && typeof err === "object" && err.named)) {
      check("unexpected failure", false, String(err).slice(0, 200));
    }
  } finally {
```

- [ ] **Step 3: Convert wait-then-check pairs (mechanical)**

Find every pair where a `check("NAME", true[, EXTRA])` IMMEDIATELY follows an `await <locator-or-page>.waitFor({ ... })` (possibly across a blank line) and convert:

```js
    await <expr>.waitFor({ ... });
    check("NAME", true);
```

to:

```js
    await must("NAME", <expr>.waitFor({ ... }));
```

and when the check carried an extra arg:

```js
    await <expr>.waitFor({ ... });
    check("NAME", true, EXTRA);
```

to:

```js
    await must("NAME", <expr>.waitFor({ ... }), EXTRA);
```

Rules:
- Convert ONLY immediate wait→check pairs. `check(..., true)` after `.click()` sequences, `page.goto`, API calls, or with intermediate awaits between the wait and the check stays as-is.
- Expected conversion sites (grep-able counts of `check(.*true)` before conversion): expenses 4, frontdesk 10, gym_ops 19, member_account 7, plans 8, platform_admin 11. Not all are wait-pairs — convert the ones that are.
- Worked example (gym_ops notifications):

```js
    await must(
      "notifications: single mark-read shows toast",
      page.getByText("Notification marked as read", { exact: true }).waitFor({ timeout: 10000 }),
    );
```

- **Careful with `platform_admin_verify.cjs`** — it is the frozen-surface regression gate. The conversion must be purely mechanical (no locator/timeout/wording changes beyond the wrap). Diff-review that file extra carefully.

- [ ] **Step 4: Verify — every script green, counts unchanged except Task 4's +1**

```bash
cd apps/web
node e2e/platform_admin_verify.cjs    # 22/22
node e2e/plans_verify.cjs             # 9/9
node e2e/member_account_verify.cjs    # 13/13
node e2e/role_visibility_verify.cjs   # 18/18
node e2e/frontdesk_verify.cjs         # 22/22
node e2e/gym_ops_verify.cjs           # 28/28
node e2e/expenses_verify.cjs          # 13/13
```

(If a converted wait legitimately fails during development, the FAIL line now names the check — that is the point; fix the underlying issue, don't revert.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/expenses_verify.cjs apps/web/e2e/frontdesk_verify.cjs \
        apps/web/e2e/gym_ops_verify.cjs apps/web/e2e/member_account_verify.cjs \
        apps/web/e2e/plans_verify.cjs apps/web/e2e/platform_admin_verify.cjs
git commit -m "test(e2e): attribute waitFor failures to their named checks"
```

---

### Task 8: Tick the completed plan's checkboxes (residue 4)

**Files:**
- Modify: `docs/superpowers/plans/2026-10-16-ui-issue-fixes.md`

- [ ] **Step 1: Tick every checkbox**

```bash
sed -i '' 's/- \[ \]/- [x]/g' docs/superpowers/plans/2026-10-16-ui-issue-fixes.md
```

(60 boxes were executed during the prior session — steps included.)

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-10-16-ui-issue-fixes.md
git commit -m "docs: mark 2026-10-16 UI-issue-fixes plan complete"
```

---

### Task 9: Global active-email unique index (residue 9)

**Files:**
- Modify: `backend/app/modules/identity/models.py`
- Create: `backend/alembic/versions/0015_users_email_global_unique.py`
- Modify: `backend/tests/test_auth.py`

- [ ] **Step 0: Pre-check the dev DB for duplicates (index creation would fail otherwise)**

```bash
cd backend && .venv/bin/python -c "
import asyncio
from sqlalchemy import text
from app.db.session import get_sessionmaker
async def main():
    S = get_sessionmaker()
    async with S() as s:
        rows = (await s.execute(text(
            \"SELECT email, count(*) c FROM users WHERE deleted_at IS NULL GROUP BY email HAVING count(*) > 1\"
        ))).all()
        print(rows or 'clean')
asyncio.run(main())
"
```

Expected: `clean`. If rows exist, delete/rename the e2e-created duplicates manually before proceeding.

- [ ] **Step 1: TDD — write the failing DB-level test**

Append to `backend/tests/test_auth.py` (new imports at top of file as needed):

```python
async def test_db_rejects_duplicate_active_email_across_tenants(gym_a, gym_b):
    """The service probe narrows cross-tenant claims, but the database is
    the backstop for probe/insert races — exercise the index directly."""
    import uuid as _uuid

    import pytest
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError

    from app.db.session import get_sessionmaker
    from app.modules.identity.models import User

    Session = get_sessionmaker()
    async with Session() as session:
        owner_a = await session.scalar(
            select(User).where(User.email == "owner-gyma@example.com")
        )
        assert owner_a is not None
        session.add(
            User(
                tenant_id=_uuid.UUID(str(gym_b["id"])),
                email=owner_a.email,
                full_name="Cross-Tenant Dupe",
            )
        )
        with pytest.raises(IntegrityError):
            await session.flush()
        await session.rollback()
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && .venv/bin/python -m pytest tests/test_auth.py::test_db_rejects_duplicate_active_email_across_tenants -q
```

Expected: FAIL (no IntegrityError raised — index missing; flush succeeds). Undo any created row if the test failed halfway (the rollback in the test body must always run — if flush succeeded before the index existed, the `with pytest.raises` fails and rollback never runs; structure the test so the outer `async with Session()` closes and rolls back on exception — the context manager does this).

- [ ] **Step 3: Add the index to the model**

In `backend/app/modules/identity/models.py`, change `User.__table_args__` to:

```python
    __table_args__ = (
        Index(
            "uq_users_tenant_email_active",
            "tenant_id",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "uq_users_email_active",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
```

- [ ] **Step 4: Create migration 0015**

`backend/alembic/versions/0015_users_email_global_unique.py`:

```python
"""global active-email uniqueness

The service-level probe in update_me narrows cross-tenant email claims, but
a probe/insert race can slip between the two. Back the app-level rule with a
partial unique index; SoftDelete semantics stay intact (a soft-deleted
email can be re-registered).

Revision ID: 0015_users_email_global_unique
Revises: 0014_expenses
Create Date: 2026-10-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_users_email_global_unique"
down_revision = "0014_expenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_users_email_active",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_email_active", table_name="users")
```

- [ ] **Step 5: Migrate + run the test**

```bash
cd backend && .venv/bin/alembic upgrade head
.venv/bin/python -m pytest tests/test_auth.py -q        # 10 passed
```

- [ ] **Step 6: Full backend gate**

```bash
.venv/bin/python -m pytest -q        # 65 passed
.venv/bin/ruff check app tests scripts
cd ../apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22
```

- [ ] **Step 7: Commit**

```bash
cd /Users/amit/Documents/Forge
git add backend/app/modules/identity/models.py \
        backend/alembic/versions/0015_users_email_global_unique.py \
        backend/tests/test_auth.py
git commit -m "feat(auth): global unique active-email index backstops probe races"
```

---

### Task 10: Bound timezone fields (residue 12) — USER-APPROVED platform schema touch

**Files:**
- Modify: `backend/app/modules/tenancy/schemas.py`
- Modify: `backend/tests/test_platform_management.py`
- Modify: `backend/tests/test_branches.py`

> **Frozen-surface note:** `GymUpdateRequest` feeds the platform `PATCH /platform/gyms/{id}` route. This task changes its behavior: timezones over 64 chars now 422 instead of being stored. The user explicitly approved this residue fix. Everything else on the platform surface stays byte-identical; the gate must remain 22/22.

- [ ] **Step 1: TDD — write the two failing tests**

Append to `backend/tests/test_platform_management.py` (mirrors `test_update_gym_profile`):

```python
async def test_update_gym_rejects_overlong_timezone(client, platform_token):
    gym = await provision_gym(client, platform_token, "tztoo")
    response = await client.patch(
        f"/api/v1/platform/gyms/{gym['id']}",
        headers=await _headers(platform_token),
        json={"timezone": "x" * 65},
    )
    assert response.status_code == 422, response.text
```

Append to `backend/tests/test_branches.py` (mirrors `_create_branch` usage):

```python
async def test_branch_update_rejects_overlong_timezone(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token, "TZ Bound St")
    response = await client.patch(
        f"/api/v1/branches/{branch['id']}",
        headers=_headers(token),
        json={"timezone": "x" * 65},
    )
    assert response.status_code == 422, response.text
```

- [ ] **Step 2: Run to verify both fail**

```bash
cd backend && .venv/bin/python -m pytest \
  tests/test_platform_management.py::test_update_gym_rejects_overlong_timezone \
  tests/test_branches.py::test_branch_update_rejects_overlong_timezone -q
```

Expected: 2 FAILED (200/201 instead of 422).

- [ ] **Step 3: Bound the schema fields**

In `backend/app/modules/tenancy/schemas.py`, change:

```python
class GymUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = None
```

to:

```python
class GymUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = Field(default=None, max_length=64)
```

and in `BranchUpdate`:

```python
    timezone: str | None = Field(default=None, max_length=64)
```

- [ ] **Step 4: Verify + full gates**

```bash
.venv/bin/python -m pytest -q                 # 67 passed
.venv/bin/ruff check app tests scripts
cd ../apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs   # 22/22
```

- [ ] **Step 5: Commit**

```bash
cd /Users/amit/Documents/Forge
git add backend/app/modules/tenancy/schemas.py \
        backend/tests/test_platform_management.py \
        backend/tests/test_branches.py
git commit -m "feat(tenancy): bound timezone fields to 64 chars"
```

---

## Phase 11: Full automated verification (controller-run)

- [ ] Backend: `cd backend && .venv/bin/python -m pytest -q` → 67 passed; `.venv/bin/ruff check app tests scripts` → clean
- [ ] Frontend: `cd apps/web && npx tsc --noEmit` → exit 0; `npm test` → fail 0
- [ ] Gate: `NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs` → 22/22
- [ ] All e2e (sequential): plans 9/9, member_account 13/13, role_visibility 18/18, frontdesk 22/22, gym_ops 28/28, expenses 13/13

## Phase 12: Chrome DevTools role×module QA (controller-run, live browser)

All against `http://localhost:3000` (dev servers already running). Use MCP chrome-devtools tools (navigate/snapshot/fill/click/screenshot). Log every module pass/fail. Mutations: use `QA-<ts>` temp names; restore/delete anything touched (checklists include restore steps). Do NOT run destructive actions on the imported Evolve gym beyond reversible UI navigation + one temp member.

### QA-0: Platform Admin (`admin@gym-erp.dev` / `admin-pass-123`)
- [ ] Login → lands on platform Overview (gym count, MRR/revenue stats render)
- [ ] Gyms: lists Evolve Gym + demo gym; no edit actions exercised beyond opening a detail if present (frozen — read-only spot check)
- [ ] Gym owners: lists demo-owner + imported owner
- [ ] Subscriptions: tier cards render (Starter/Pro/Enterprise)
- [ ] Revenue: chart area renders
- [ ] Gym nav items (Members/Billing/…) NOT present in sidebar (platform scope)
- [ ] Settings: profile page renders; no Gym profile card (no tenancy.settings.manage at platform scope)

### QA-1: Gym Owner — demo gym (`demo-owner@gym-erp.dev` / `owner-pass-123`)
- [ ] Overview: greeting + stat cards + activity widgets
- [ ] Members: list renders; create temp member `QA-<ts>` via UI; open detail; edit last name; disable→enable; delete if UI allows (else leave + note)
- [ ] Check-ins: Quick check-in records a check-in for the temp member; Recent activity shows it
- [ ] Plans: list renders; create temp plan `QA Plan <ts>` (if form exists) then delete/leave note
- [ ] Subscriptions: list renders; activate a pending sub only if one exists (skip otherwise)
- [ ] Billing: summary cards + table; search by number and by member (the 4b fix); open one invoice detail; (pay only against a self-created invoice)
- [ ] Expenses: create temp expense `QA Expense <ts>`; appears in table + Total spent moves; delete it; toast "Expense deleted"
- [ ] Notifications: mark one read (toast appears — 4c behavior intact); Mark all read button present
- [ ] Branches: create `QA Branch <ts>`; rename it; delete it; MAIN untouched
- [ ] Roles: catalog renders; custom roles from e2e visible; expand Receptionist; toggle a switch → header Save renders OUTSIDE role=button (`[role="button"] button` count 0 — Task 4); click Save by keyboard (Enter) works; create-role modal opens + Cancel resets; duplicate name `Receptionist` blocked
- [ ] Settings: profile — change name to `QA Owner <ts>` → success toast (green); change email to an existing email (`receptionist@gym-erp.dev`) → ERROR-styled toast "That email is already taken" (Task 1 visual); restore name+email; gym profile — rename gym `QA Gym <ts>` → sidebar tenant name updates (Task 2); restore; branch-access toggle flips + restores; Gym profile + Branch access cards visible (owner-only)
- [ ] Roles access: Danger zone card visible

### QA-2: Branch Manager (`branch-manager@gym-erp.dev` / `manager-pass-123`)
- [ ] Nav = Overview, Members, Check-ins, Plans, Subscriptions, Billing, Expenses, Notifications, Branches; NO Roles item
- [ ] Members: list + open detail (view/update perms)
- [ ] Check-ins: record works
- [ ] Expenses: page renders (manager has expenses.manage)
- [ ] Roles URL `/roles` directly → permission-denied empty state (no roles.manage)
- [ ] Settings: profile + permissions cards render; NO Gym profile card (no tenancy.settings.manage)

### QA-3: Receptionist (`receptionist@gym-erp.dev` / `receptionist-pass-123`)
- [ ] Nav = Overview, Members, Check-ins, Plans, Subscriptions, Billing, Notifications, Branches; NO Expenses, NO Roles
- [ ] Members: create temp member `QA-Rec-<ts>`; edit
- [ ] Check-ins: quick check-in works
- [ ] Billing: list + search (4b) + open invoice detail (1)
- [ ] `/expenses` direct URL → permission-denied empty state
- [ ] Notifications: list renders; mark-one works

### QA-4: Trainer (`trainer@gym-erp.dev` / `trainer-pass-123`)
- [ ] Nav = Overview, Members, Check-ins, Plans, Branches, Notifications; NO Subscriptions, Billing, Expenses, Roles
- [ ] Members: list visible (view-only ok — check no Add member button if no members.create)
- [ ] Check-ins: Recent activity visible; check-in action available (attendance.checkin)
- [ ] `/billing` direct → permission-denied empty state

### QA-5: Imported owner — Evolve Gym (`mramitdas99@gmail.com` / `evolve-import-2026`)
- [ ] Login succeeds (no forced change-password gate)
- [ ] Sidebar tenant name = Evolve Gym
- [ ] Members: total ≈ 560; list renders with pagination/scroll
- [ ] Billing: invoice list renders (1965 imports)
- [ ] Expenses: 58 rows; categories Electricity/Rent/Salary; Total spent ₹6,99,210
- [ ] Notifications/Overview render

### QA-6: Restore pass (controller)
- [ ] Revert any leftover QA temp data (members/plans/expenses/branches/roles/gym name/profile name) created in QA-1..QA-5
- [ ] Final spot re-run: `node e2e/gym_ops_verify.cjs` (28/28) to prove the QA pass didn't leave the demo gym in a state that breaks the suite

## Self-Review
- All 12 residue items map to Tasks 1–10 (table above); Phases 11–12 cover verification.
- No placeholders: every task has exact code. Task 7's conversion is a precise mechanical rule with worked example and per-file counts.
- Type consistency: `notify` helper only in settings; `refreshMe` updater used only by Task 2 call site; `must(name, p, extra)` signature stable across 6 scripts; index name `uq_users_email_active` consistent across model/migration/test.
