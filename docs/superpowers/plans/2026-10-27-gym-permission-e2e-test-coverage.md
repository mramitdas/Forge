# Gym permission end-to-end test-coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every gym permission module (tenancy, members, membership, billing, expenses, attendance, notifications, reports, identity) covered by self-provisioning backend permission-matrix tests and house e2e scripts, with no dependence on the legacy GMS import dataset.

**Architecture:** Backend pytest creates short-lived roles/employees through the public API and asserts view vs. manage behavior per module. House Playwright-free `.cjs` scripts create/delete their own fixtures through `fetch` against the running dev servers, so they pass on a fresh `make reset` DB. The destructive migration path is exercised separately on a populated pre-`0022` database.

**Tech Stack:** Python/pytest (backend), Playwright-free Node `.cjs` house scripts (frontend e2e), Alembic migration `0022_two_tier_permissions`, Postgres `gym_erp` / `gym_erp_test`.

**Spec:** `docs/superpowers/specs/2026-10-21-gym-settings-redesign-design.md` (two-tier `<module>.view` / `<module>.manage`, manage implies view), AGENTS.md workflow/gates.

## Global Constraints
- Do not reference GMS, legacy import, `evolve-gym`, or imported-data fixtures in any test/script. The legacy GMS path is import-only data and must not be a test dependency.
- One issue = one branch = one commit = one PR targeting `dev`. Use conventional commits; body ends with `refs #13`.
- Gate commands: `make lint`, `make test-backend`, `cd apps/web && npx tsc --noEmit`, `make test-web`, `npm run build`, `make e2e` (workers=1), affected house scripts sequentially.
- No secrets, tokens, or `.env` in diffs.
- Strong test passwords only (e.g. `Owner-Pass-123!`); restore/mutate fixtures in `try/finally`; never submit real password changes in e2e.
- House e2e scripts share one dev DB: run sequentially, timestamped fixture names, cleanup in `finally`.
- Platform admin surface remains byte-for-byte unchanged; do not add platform permission assertions.

## Review Focus
- View-only employee reaches a write endpoint directly or via UI → 403 / action hidden; manage-only employee still gets read access (manage implies view).
- Deleting an employee leaves stale `user_roles`, making roles undeletable → tests must clean up employees/roles or assert known cleanup behavior.
- `make reset` wipes imported GMS data → scripts must self-provision all rows they assert on.
- House scripts must not run in parallel against shared dev DB.
- Reports has no module/UI/endpoints; `reports.view/manage` are catalog-only dead codes—decide implement or remove, do not write route tests for nonexistent endpoints.

## Files
- Create: `backend/tests/test_permission_matrix.py`
- Create: `backend/tests/test_migration_0022_upgrade.py` (or script under `backend/scripts/`)
- Modify: `apps/web/e2e/expenses_verify.cjs`
- Modify: `apps/web/e2e/billing_verify.cjs`
- Modify: `apps/web/e2e/role_visibility_verify.cjs` (manage-only + write-action assertions)
- Modify: `Makefile` (`e2e-all` to include `e2e-employees`)

## Task 1: Backend permission-matrix tests

**Interfaces**
- Consumes: existing pytest fixtures `client`, `gym_a`, `login`; public API routes under `backend/app/modules/*/api.py`.
- Produces: `backend/tests/test_permission_matrix.py` with helper `make_employee(gym_a, permission_codes)` and per-module read/write assertions.

- [ ] **Step 1: Write failing permission-matrix tests**

```python
import pytest
from httpx import AsyncClient

MODULE_MATRIX = [
    ("members", "GET /api/v1/members", [("POST /api/v1/members", 201)]),
    ...
]

async def test_view_only_cannot_write_and_manage_implies_view(client, gym_a):
    ...
```

- [ ] **Step 2: Run `make test-backend -k permission_matrix`** → expected FAIL because module does not exist.
- [ ] **Step 3: Implement tests** using API-created roles/employees and owner-created prerequisite resources (plan, invoice, expense, member, branch).
- [ ] **Step 4: Run `make test-backend`** → expected 100% pass.
- [ ] **Step 5: Commit** `git add backend/tests/test_permission_matrix.py; git commit -m "test(permissions): add two-tier view/manage matrix" -m "refs #13"`

**Expected matrix (manage implies view):**
| Module | Read check | Write check | View-only write result |
|---|---|---|---|
| members | GET /api/v1/members 200 | POST/PATCH/DELETE member 2xx | 403 |
| membership | GET /plans, /subscriptions 200 | POST /plans, subscription activate 2xx | 403 |
| billing | GET /invoices, /invoices/summary 200 | capture/void invoice 2xx | 403 |
| expenses | GET /expenses 200 | POST/PATCH/DELETE expense 2xx | 403 |
| attendance | GET /checkin 200 | POST /checkin 201 | 403 |
| tenancy | GET /branches, /settings 200 | branch CRUD + PATCH settings 2xx | 403 |
| notifications | GET /notifications 200 | no write endpoint exists | — |
| reports | no routes | no routes | catalog-only |
| identity | GET /employees 200 | roles/employees CRUD 2xx; GET /permissions/roles per current gate | 403 |

## Task 2: Self-provision expenses e2e script (remove GMS dependence)

**Files:** Modify `apps/web/e2e/expenses_verify.cjs`

**Interfaces:** Consumes running dev servers + demo owner credentials. Produces its own expense rows via `fetch POST /api/v1/expenses` and deletes them in `finally`.

- [ ] **Step 1: Rewrite the imported-gym section** to create demo-gym expenses for current/prior year via API instead of logging into `IMPORTED_OWNER`.
- [ ] **Step 2: Assert total spent, categories, and year-scoped rows** from self-created rows; delete created expenses in `finally`.
- [ ] **Step 3: Run `make e2e-expenses`** → expected all checks pass on fresh reset DB.
- [ ] **Step 4: Commit** `git add apps/web/e2e/expenses_verify.cjs; git commit -m "test(e2e): provision expenses fixtures without GMS data" -m "refs #13"`

## Task 3: Self-provision billing e2e script (remove imported-volume dependence)

**Files:** Modify `apps/web/e2e/billing_verify.cjs`

**Interfaces:** Same demo owner/session; creates enough current-year invoices through plan/subscription/member flow to exercise pagination Page 2 and search clear/restore.

- [ ] **Step 1: Replace the >20-row pagination assumption** with API-created invoices/subscriptions in the current year.
- [ ] **Step 2: Assert Page 1 of N, next/previous, search narrows to one row, clearing restores the created count.** Do not assert imported prior-year totals.
- [ ] **Step 3: Run `make e2e-billing`** → expected all checks pass on fresh reset DB.
- [ ] **Step 4: Commit** `git add apps/web/e2e/billing_verify.cjs; git commit -m "test(e2e): provision billing fixtures without imported volume" -m "refs #13"`

## Task 4: Extend role visibility e2e for manage-only write actions

**Files:** Modify `apps/web/e2e/role_visibility_verify.cjs`

**Interfaces:** Already creates viewer and manager roles/employees via API and cleans them. Add assertions for write-action visibility: Add member, Pay now/capture, create plan, create expense, check-in, branch/settings write controls.

- [ ] **Step 1: Add manager write-action checks** to existing manager login block.
- [ ] **Step 2: Add viewer denied-action checks** where UI exposes write buttons (Add member hidden, Pay now hidden).
- [ ] **Step 3: Run `make e2e-roles`** → expected all checks pass.
- [ ] **Step 4: Commit** `git add apps/web/e2e/role_visibility_verify.cjs; git commit -m "test(e2e): assert view-only vs manage write actions" -m "refs #13"`

## Task 5: Migration upgrade path on populated DB

**Files:** Create backend migration test/script.

**Interfaces:** Temp Postgres database at Alembic `0021_member_status_enum`, legacy-style role/catalog rows present, then `alembic upgrade head` (`0022_two_tier_permissions`).

- [ ] **Step 1: Write migration upgrade test** that seeds old granular permission/role rows, runs `backend/.venv/bin/alembic upgrade head`, and asserts old codes are gone, staff templates removed, Gym Owner rebuilt with 18 codes.
- [ ] **Step 2: Run the migration test** → expected pass; downgrade remains intentional no-op.
- [ ] **Step 3: Commit** migration test with `refs #13`.

## Task 6: Gate runs and commit

**Files:** `Makefile`

**Interfaces:** `make e2e-all` target includes `e2e-employees`.

- [ ] **Step 1: Add `e2e-employees` to `e2e-all`.**
- [ ] **Step 2: Run full gates:** `make lint`, `make test-backend`, `npx tsc --noEmit`, `make test-web`, `npm run build`, `make e2e`, then all house scripts sequentially including expenses and billing.
- [ ] **Step 3: Commit** `git add Makefile; git commit -m "chore: include employee e2e in e2e-all" -m "refs #13"`
- [ ] **Step 4: Push branch, open PR to `dev`, merge after CI passes.**
