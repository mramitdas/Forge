# Member Status 3-Value Enum (active / inactive / frozen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six-value member status enum (`lead, prospect, active, frozen, lapsed, cancelled`) with exactly `active, inactive, frozen` across backend, migration, frontend, and tests.

**Architecture:** Backend enum + pydantic defaults change at the single `_validate_status` choke point; a data-only alembic migration (`0021`) rewrites existing rows (plus historical `custom_data['branch_frozen_prev']` values) using the `app.platform_scope` GUC required by FORCE ROW LEVEL SECURITY. Frontend vocabulary collapses to raw pass-through — chips, badges, and both edit modals show the three values.

**Tech Stack:** FastAPI + SQLAlchemy + alembic (backend), Next.js/React Query (frontend), node:test (unit), house e2e scripts + `make e2e` (integration).

**Spec:** `docs/superpowers/specs/2026-10-22-member-status-enum-design.md`

**Environment rules:** dev servers (`make dev` :8000, `make web` :3000) stay running — uvicorn/Next hot-reload, never restart. Playwright runs `workers: 1` only (never override). Run e2e house scripts sequentially, never in parallel (shared dev DB). Node for unit tests needs the pinned node24 on PATH (command below). Never `git add -A` — stage listed paths only.

**Current test baselines:** backend pytest **119**, ruff clean, tsc clean, npm test **21**, `make e2e` **59 passed/1 skipped**, e2e-frontdesk **29**, e2e-member **15**, e2e-roles **18**, e2e-plans **9**, e2e-gym **36**.

---

### Task 1: Backend enum cutover (TDD)

**Files:**
- Modify: `backend/app/modules/members/models.py:18` and `:34`
- Modify: `backend/app/modules/members/schemas.py:18`
- Modify: `backend/app/modules/tenancy/service.py:481`
- Modify: `backend/scripts/import_gms.py:212`
- Modify: `backend/tests/test_member_account.py` (new test + default-status assert)
- Modify: `backend/tests/test_auth.py:411`, `backend/tests/test_isolation.py:31`, `backend/tests/test_members_search.py:38,53`, `backend/tests/test_order_tiebreakers.py:45`, `backend/tests/test_slice.py:55,69`, `backend/tests/test_tenant_tier.py:43`

- [ ] **Step 1: Append the failing regression test to `backend/tests/test_member_account.py`**

Append at end of file:

```python
async def test_member_update_rejects_unknown_status(client, gym_acct):
    owner = await login(client, "owner-acct@example.com", "owner-pass-123")
    token = owner["access_token"]
    branch = await _create_branch(client, token)
    member = await _create_member(client, token, branch["id"])
    response = await client.patch(
        f"/api/v1/members/{member['id']}",
        headers=_headers(token),
        json={"status": "lead"},
    )
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "INVALID_STATUS"
```

Also extend `test_member_create_defaults_is_active` — the shared helper sends
`status` explicitly, so the default needs its own raw create. After
`assert member["avatar_path"] is None` add:

```python
    raw = await client.post(
        "/api/v1/members",
        headers=_headers(token),
        json={"first_name": "Default", "last_name": "Status", "branch_id": branch["id"]},
    )
    assert raw.status_code == 201, raw.text
    assert raw.json()["status"] == "active"
```

- [ ] **Step 2: Run the new test — expect FAIL** (`lead` is still a valid status, so PATCH returns 200 today)

Run: `cd backend && .venv/bin/python -m pytest tests/test_member_account.py::test_member_update_rejects_unknown_status -v`
Expected: FAIL with `assert 200 == 409`

- [ ] **Step 3: Edit `backend/app/modules/members/models.py` (two edits)**

```python
# line 18
MEMBER_STATUSES = ("active", "inactive", "frozen")
```

```python
# line 34
status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
```

- [ ] **Step 4: Edit `backend/app/modules/members/schemas.py:18`**

```python
    status: str = "active"
```

- [ ] **Step 5: Run the new test — expect PASS**

Run: `cd backend && .venv/bin/python -m pytest tests/test_member_account.py::test_member_update_rejects_unknown_status tests/test_member_account.py::test_member_create_defaults_is_active -v`
Expected: `2 passed`

- [ ] **Step 6: Replace the old-vocabulary literals in the six other test files** (each is the only occurrence in its file except `test_members_search.py` which has two)

| File | old | new |
|---|---|---|
| `test_auth.py:411` | `"status": "prospect",` | `"status": "inactive",` |
| `test_isolation.py:31` | `"status": "prospect",` | `"status": "inactive",` |
| `test_members_search.py:38,53` | `"status": "prospect",` (both) | `"status": "inactive",` |
| `test_order_tiebreakers.py:45` | `"status": "lead",` | `"status": "inactive",` |
| `test_slice.py:55` | `"status": "prospect",` | `"status": "inactive",` |
| `test_slice.py:69` | `assert member["status"] == "prospect"` | `assert member["status"] == "inactive"` |
| `test_tenant_tier.py:43` | `"status": "lead",` | `"status": "inactive",` |

- [ ] **Step 7: Edit `backend/app/modules/tenancy/service.py:481` — branch-disable freeze guard**

```python
        if member.status == "active":
```

(replaces `if member.status not in {"frozen", "lapsed", "cancelled"}:` — post-migration `lead`/`prospect` rows are `active`, so this freezes exactly the same set; the restore guard at line 503 keeps `previous not in MEMBER_STATUSES` and migration 0021 rewrites stored previous values.)

- [ ] **Step 8: Edit `backend/scripts/import_gms.py:212`**

```python
                        status="active" if u["is_active"] else "inactive",
```

(replaces `else "cancelled"`)

- [ ] **Step 9: Full backend suite + lint — expect 120 passed, ruff clean**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: `120 passed` (119 baseline + 1 new)

Run: `cd backend && .venv/bin/python -m ruff check app tests`
Expected: `All checks passed!`

- [ ] **Step 10: Commit**

```bash
git add backend/app/modules/members/models.py backend/app/modules/members/schemas.py \
  backend/app/modules/tenancy/service.py backend/scripts/import_gms.py \
  backend/tests/test_member_account.py backend/tests/test_auth.py \
  backend/tests/test_isolation.py backend/tests/test_members_search.py \
  backend/tests/test_order_tiebreakers.py backend/tests/test_slice.py \
  backend/tests/test_tenant_tier.py
git commit -m "feat(members): status enum collapses to active/inactive/frozen"
```

---

### Task 2: Data migration `0021` + dev DB upgrade

**Files:**
- Create: `backend/alembic/versions/0021_member_status_enum.py`

- [ ] **Step 1: Write the migration**

```python
"""Collapse member status vocabulary to active/inactive/frozen.

Old enum: lead, prospect, active, frozen, lapsed, cancelled.
New enum: active, inactive, frozen.

Mapping: lead/prospect -> active, lapsed/cancelled -> inactive,
active/frozen unchanged. Also rewrites historical
custom_data['branch_frozen_prev'] values stored by the branch
disable/enable flow, otherwise the restore guard
(`previous not in MEMBER_STATUSES`) silently skips them.

Revision ID: 0021_member_status_enum
Revises: 0020_fix_is_system
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0021_member_status_enum"
down_revision = "0020_fix_is_system"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # members has FORCE ROW LEVEL SECURITY — without the platform-scope GUC
    # the UPDATEs match zero rows (same pattern as 0020).
    op.execute(sa.text("SELECT set_config('app.platform_scope', 'on', false)"))
    op.execute(
        sa.text(
            """
            UPDATE members
            SET status = CASE status
                WHEN 'lead' THEN 'active'
                WHEN 'prospect' THEN 'active'
                WHEN 'lapsed' THEN 'inactive'
                WHEN 'cancelled' THEN 'inactive'
                ELSE status
            END
            WHERE status IN ('lead', 'prospect', 'lapsed', 'cancelled')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE members
            SET custom_data = jsonb_set(
                custom_data::jsonb,
                '{branch_frozen_prev}',
                to_jsonb(
                    CASE custom_data->>'branch_frozen_prev'
                        WHEN 'lead' THEN 'active'
                        WHEN 'prospect' THEN 'active'
                        WHEN 'lapsed' THEN 'inactive'
                        WHEN 'cancelled' THEN 'inactive'
                        ELSE custom_data->>'branch_frozen_prev'
                    END
                )
            )::json
            WHERE custom_data->>'branch_frozen_prev'
                  IN ('lead', 'prospect', 'lapsed', 'cancelled')
            """
        )
    )


def downgrade() -> None:
    # Data migration — not reversible: the collapsed vocabulary cannot
    # distinguish the original six values.
    pass
```

- [ ] **Step 2: Upgrade the dev DB**

Run: `cd backend && .venv/bin/alembic upgrade head`
Expected: prints upgrade log ending with `0021_member_status_enum ... done`

- [ ] **Step 3: Verify dev data (single session so the GUC applies)**

Run:
```bash
PGPASSWORD=gym_dev_pass psql -h 127.0.0.1 -U gym -d gym_erp -c \
"SELECT set_config('app.platform_scope','on',false);
 SELECT status, count(*) FROM members GROUP BY status ORDER BY status;
 SELECT count(*) AS stale_prev FROM members
 WHERE custom_data->>'branch_frozen_prev' IN ('lead','prospect','lapsed','cancelled');"
```
Expected: statuses only `active | frozen | inactive` (evolve gym has ~560 members); `stale_prev = 0`

- [ ] **Step 4: Re-run backend suite — conftest re-runs alembic against the test DB, validating the migration**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: `120 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0021_member_status_enum.py
git commit -m "feat(members): migrate status data to active/inactive/frozen"
```

---

### Task 3: Frontend core — type, adapter, badge tone (TDD)

**Files:**
- Modify: `apps/web/src/lib/adapters.test.ts` (new test)
- Modify: `apps/web/src/lib/mock.ts:1`
- Modify: `apps/web/src/lib/adapters.ts:186-201` (mapMemberStatus) and `:111` (LEAD tag)
- Modify: `apps/web/src/components/ui.tsx:198-219` (statusTone)

- [ ] **Step 1: Append the failing unit test to `apps/web/src/lib/adapters.test.ts`**

```ts
test("member status uses the 3-value vocabulary with active fallback", () => {
  const ctx = { subscriptions: [], invoices: [], checkins: [] };
  assert.equal(toUiMember(member({ status: "inactive" }), ctx).status, "inactive");
  assert.equal(toUiMember(member({ status: "frozen" }), ctx).status, "frozen");
  assert.equal(toUiMember(member({ status: "active" }), ctx).status, "active");
  assert.equal(toUiMember(member({ status: "prospect" }), ctx).status, "active");
  assert.equal(toUiMember(member({ status: "lead" }), ctx).tags.includes("LEAD"), false);
});
```

- [ ] **Step 2: Run unit tests — expect FAIL**

Run: `cd apps/web && PATH="/var/folders/_g/6d1ch_hn6q3446y1r_y_vhp80000gn/T/opencode/node-v24.22.1-darwin-arm64/bin:$PATH" npm test`
Expected: `fail 1` — `inactive` maps to `expired`/`lead` under the old mapper

- [ ] **Step 3: Edit `apps/web/src/lib/mock.ts:1`**

```ts
export type MemberStatus = "active" | "inactive" | "frozen";
```

(replaces `"active" | "paused" | "expired" | "lead"`)

- [ ] **Step 4: Replace `mapMemberStatus` in `apps/web/src/lib/adapters.ts` (lines 186-201)**

```ts
function mapMemberStatus(s: string): Member["status"] {
  switch (s) {
    case "inactive":
    case "frozen":
      return s;
    default:
      return "active";
  }
}
```

- [ ] **Step 5: Remove the LEAD tag line in `apps/web/src/lib/adapters.ts` (line 111)**

Delete this line from `memberTags`:

```ts
  if (m.status === "lead") tags.push("LEAD");
```

- [ ] **Step 6: Add the two tone cases in `apps/web/src/components/ui.tsx` `statusTone`** (existing cases untouched — platform surfaces stay byte-for-byte identical)

```ts
    case "paused":
    case "pending":
    case "open":
    case "frozen":
      return "amber";
    case "expired":
    case "overdue":
    case "denied":
    case "cancelled":
    case "void":
    case "inactive":
      return "red";
```

(`frozen→amber` keeps the old amber look frozen members had as "Paused"; `inactive→red` continues the expired/red family. `active→green` already exists.)

- [ ] **Step 7: Unit tests + typecheck — expect 22 pass, tsc clean**

Run: `cd apps/web && PATH="/var/folders/_g/6d1ch_hn6q3446y1r_y_vhp80000gn/T/opencode/node-v24.22.1-darwin-arm64/bin:$PATH" npm test`
Expected: `pass 22`, `fail 0`

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/adapters.test.ts apps/web/src/lib/mock.ts \
  apps/web/src/lib/adapters.ts apps/web/src/components/ui.tsx
git commit -m "feat(web): member status vocabulary collapses to active/inactive/frozen"
```

---

### Task 4: UI edits — members page, detail modal, plans picker

**Files:**
- Modify: `apps/web/src/app/(app)/members/page.tsx` (chips/statusParam :54-61, editForm init :114, create body :133, toast :144, subtitle :394, list-modal options :553-558)
- Modify: `apps/web/src/app/(app)/members/[id]/page.tsx` (options :576-581, tone fallback :411)
- Modify: `apps/web/src/app/(app)/plans/page.tsx:125-127`

- [ ] **Step 1: Filter chips + param map in `members/page.tsx`**

```ts
const filters = ["All", "active", "inactive", "frozen"] as const;
const statusParam: Record<(typeof filters)[number], string | undefined> = {
  All: undefined,
  active: "active",
  inactive: "inactive",
  frozen: "frozen",
};
```

(replaces the `paused→frozen`, `expired→lapsed`, `lead→lead` remap table; chip labels render automatically as All / Active / Inactive / Frozen)

- [ ] **Step 2: `members/page.tsx` editForm initial state — `status: "lead",` becomes `status: "active",`** (only the initial value inside `useState({...})`; `openEdit` overwrites it with `rawStatus`)

- [ ] **Step 3: `members/page.tsx` addMember — delete the `status: "lead",` line from the `createMember.mutateAsync` body** (backend default is now `active`)

- [ ] **Step 4: Toast + subtitle**

```ts
        setToast({ type: "success", message: `${form.name.trim()} added` });
```

```tsx
      <Modal open={open} onClose={() => setOpen(false)} title="Add member" subtitle="Members can subscribe to a plan later.">
```

- [ ] **Step 5: Replace the six status `<option>`s with three — same block appears in BOTH `members/page.tsx` (list-row edit modal) and `members/[id]/page.tsx` (detail edit modal)**

```tsx
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="frozen">Frozen</option>
```

- [ ] **Step 6: `members/[id]/page.tsx:411` subscription badge fallback**

```tsx
          <SectionTitle title="Subscription" action={plan ? <Badge tone={statusTone(sub?.status ?? "pending")}>{sub?.status}</Badge> : undefined} />
```

- [ ] **Step 7: `plans/page.tsx:125-127` — drop the lead filter**

```ts
  const memberOptions = rawMembers.map((m) => ({ id: m.id, name: m.full_name || m.first_name }));
```

- [ ] **Step 8: Typecheck + unit tests**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output

Run: `cd apps/web && PATH="/var/folders/_g/6d1ch_hn6q3446y1r_y_vhp80000gn/T/opencode/node-v24.22.1-darwin-arm64/bin:$PATH" npm test`
Expected: `pass 22`, `fail 0`

- [ ] **Step 9: Commit**

```bash
git add "apps/web/src/app/(app)/members/page.tsx" \
  "apps/web/src/app/(app)/members/[id]/page.tsx" \
  "apps/web/src/app/(app)/plans/page.tsx"
git commit -m "feat(web): member status dropdown, chips, and copy use 3-value vocabulary"
```

---

### Task 5: Full gate run

**Files:** none (verification only; fix fallout in the file that caused it and amend the relevant area with its own commit)

- [ ] **Step 1: Backend gates**

Run: `cd backend && .venv/bin/python -m pytest -q && .venv/bin/python -m ruff check app tests`
Expected: `120 passed` + `All checks passed!`

- [ ] **Step 2: Frontend gates**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no output

Run: `cd apps/web && PATH="/var/folders/_g/6d1ch_hn6q3446y1r_y_vhp80000gn/T/opencode/node-v24.22.1-darwin-arm64/bin:$PATH" npm test`
Expected: `pass 22`, `fail 0`

- [ ] **Step 3: Platform suite (required — `components/ui.tsx` changed)**

Run: `make e2e`
Expected: `59 passed`, `1 skipped`

- [ ] **Step 4: House e2e scripts, strictly sequential**

Run one at a time, waiting for each to finish:
```bash
make e2e-frontdesk   # expected 29/29 — asserts "Active" badge + row click
make e2e-member      # expected 15/15 — edit modal saves with 3-option status select
make e2e-roles       # expected 18/18 — Add member gating
make e2e-plans       # expected 9/9 — Subscribe button
make e2e-gym         # expected 36/36 — role pills + "Total members"
```

- [ ] **Step 5: Commit any fallout fixes**

```bash
git add <specific files fixed>
git commit -m "test: adapt <domain> to 3-value member status"
```

(No commit needed if every gate passed on the first run.)

---

## Self-review notes (plan vs spec)

- Spec §migration → Task 2 (both UPDATEs, GUC, verify query).
- Spec §backend (enum, defaults, guard, import) → Task 1.
- Spec §frontend (dropdowns, create copy, chips, type, tones, plans filter, detail fallback) → Tasks 3-4.
- Spec §tests (7 literals + assertion + new 409 regression + defaults assert) → Tasks 1/3.
- Spec §gates (pytest/ruff/tsc/npm/`make e2e`/five house scripts) → Task 5.
- Extra discovered during planning, included: `adapters.ts:111` LEAD tag removal (would be dead code + renders impossible), `editForm` initial `status: "lead"` (would render an option that no longer exists until openEdit runs).
- Type consistency: `MemberStatus` (mock.ts), `mapMemberStatus` return, `statusTone` cases, and both modal `<option>` values all use identical literals `active|inactive|frozen`.
