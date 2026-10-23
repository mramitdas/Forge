# Plan Required When Adding a Member — Design

**Date:** 2026-10-22
**Status:** shipped (implementation plan: `docs/superpowers/plans/2026-10-22-member-plan-required.md`; HEAD `04f20a7` + fix commit)
**Repo state at design time:** member-status 3-value enum shipped (`8be4b19`, `2bf747b`, `c0a2b1c`, `a48e8ec`), all gates green.

## Problem

1. `POST /api/v1/members` accepts members with no subscription. The Add-member modal offers "No plan yet" as its first option, so every member-creation path can produce plan-less members.
2. The member detail page's Subscription card is a dead end for plan-less members: it renders `EmptyState "No active subscription — Assign a plan to get started."` with no action. The only place to create a subscription is the Plans page.

## Decisions (user-confirmed)

1. **Plan required at creation** — adding a member must select a valid plan; membership starts immediately.
2. **Enforced at the API boundary** (backend + UI) — `POST /members` gains required `plan_id`. The service layer (`members/service.create_member`) stays flexible so direct service callers (`import_gms.py`, `seed_dev.py`) are untouched.
3. **Orchestration lives in the API endpoint** — `members/api.py create()` reuses `membership.service.create_subscription` + `activate_subscription` in the same session/transaction.
4. **Status dropdown removed from the add modal** — activation forces member status to `active`, so the dropdown was contradictory. Status changes remain available via member Edit.
5. **Detail-page "Assign plan" button stays out of scope** (user chose creation-only enforcement; existing plan-less members remain a detail-page dead end).

## API contract

`POST /api/v1/members` — `MemberCreate` gains **required `plan_id: uuid.UUID`**. Response stays `MemberOut` (201).

Server-side flow, one transaction (failure anywhere → nothing persists):

1. `assert_branch_in_scope` (existing)
2. `create_member(...)` (existing, status defaults to `active`)
3. `membership.service.create_subscription(tenant_id, member_id, plan_id, branch_id)` — validates the plan and creates a `pending` subscription + invoice
4. `membership.service.activate_subscription(subscription_id)` — sets subscription `active`; member is already `active` (also sets `joined_at` if it wasn't)

**Plan validation is NOT re-implemented** — `create_subscription` already owns it (`membership/service.py:184-192`) and its errors bubble up unchanged:

| Condition | Error | Code |
|---|---|---|
| Plan missing, soft-deleted, or other gym | 404 | `NOT_FOUND` |
| Plan disabled (`is_active == false`) | 409 | `PLAN_DISABLED` |
| Plan is branch-specific and `branch_id != body.branch_id` | 409 | `PLAN_BRANCH_MISMATCH` |
| Body missing `plan_id` | 422 | FastAPI validation error |

**Permissions:** `members.create` alone completes the whole operation (subscription steps run server-side; no separate `subscriptions.create`/`activate` permission is checked). Behavior improvement: roles that could create members but previously 403'd mid-flow on the client-side subscribe call can now add members end-to-end.

**Side effects to be aware of:** every member create now also creates an **invoice** (`create_invoice_for_subscription`, `membership/service.py:242-244`) and an **active subscription**. If the member somehow already had an active subscription, the new term is queued to start after it ends (`membership/service.py:202-218`) — there is no one-active-subscription conflict.

## Backend implementation

- `backend/app/modules/members/schemas.py` — `MemberCreate` gains `plan_id: uuid.UUID` (required). `status` field stays on the schema (default `active`) for API consumers; the UI no longer sends it.
- `backend/app/modules/members/api.py create()` — after `assert_branch_in_scope`, call `create_subscription` then `activate_subscription` (imported from `app.modules.membership.service`), then return `MemberOut.model_validate(member)` as today.
- `backend/app/modules/members/service.py` — **unchanged**.

## Frontend (`apps/web/src/app/(app)/members/page.tsx` add modal only)

- `addMember` becomes a single `createMember.mutateAsync({ ..., plan_id: form.planId })` — the client-side `subscribe` + `activate` sequence (lines 133-140) and now-unused hook imports (`useSubscribe`, `useActivate` if unused elsewhere on the page) are deleted.
- `useCreateMember` body type (`lib/hooks.ts`) gains `plan_id: uuid` (shared file — `make e2e` gate required).
- Plan dropdown:
  - Label and aria-label: **"Plan"** (was "Intended plan").
  - "No plan yet" option removed; a disabled placeholder `Select a plan…` (or empty-list message) is the default.
  - Options filtered to `is_active` plans compatible with the selected branch (`branch_id` null = common plan, or equals selected branch). Type fields (`is_active`, `branchId`) verified against `PlanOut` during implementation.
  - Empty filtered list → `No plans — create one first` option (mirrors the existing `No branches — add one first` pattern at `members/page.tsx:443`).
  - Switching branch clears `planId` if the selection is no longer compatible.
- Submit button disabled until `form.planId` is set.
- **Status select removed** from the modal (and the `status` key dropped from form state / create body).
- Subtitle: "Members can subscribe to a plan later." → **"Subscription starts immediately."** Toast stays `"{name} added"`.

## Test & script ripple

- **pytest** (~15 `POST /members` creates across 11 files: test_auth, test_isolation, test_branches, test_member_account, test_members_search, test_order_tiebreakers, test_slice, test_tenant_tier, test_billing_pagination, test_plans, test_platform_management):
  - Each create gains `plan_id`; a plan-creation helper/fixture is added per file (house style: per-file `_create_*` helpers; conftest only if it already carries comparable fixtures).
  - Assertions that count subscriptions/invoices may shift because every create now emits one subscription + one invoice — affected tests audited and adapted in the plan (billing pagination, plans subscribe flows, platform revenue-ish counts).
  - There is **no** active-subscription conflict (queued continuation), so subscribe-flow tests still work; they may need to account for the queued term/start date.
  - New tests: create with valid plan → 201, member `active`, exactly one `active` subscription; missing `plan_id` → 422; disabled plan → 409 `PLAN_DISABLED`; branch-specific wrong branch → 409 `PLAN_BRANCH_MISMATCH`; other gym's plan → 404 `NOT_FOUND`.
- **e2e house scripts** creating members via API (`frontdesk_verify.cjs` ×2, `member_account_verify.cjs` ×1, `gym_ops_verify.cjs` ×1): add plan setup (if not already present) + `plan_id`; drop now-redundant subscribe/activate calls if present. `plans`, `roles`, `expenses`, platform Playwright suite audited — plans e2e's Subscribe button targets existing members and is untouched.
- **Service-level callers** (`import_gms.py`, `seed_dev.py`): no changes (they call `create_member` directly and manage their own plans/subscriptions).

## Out of scope

- Detail-page empty-state "Assign plan" action (existing plan-less members stay a dead end)
- Plans-page Subscribe flow, member-edit status changes, service-layer enforcement, import/seed scripts

## Success criteria / gates

- `cd backend && .venv/bin/python -m pytest -q` green (count will grow), ruff clean
- `npx tsc --noEmit` clean; `npm test` green
- `make e2e` green (required — `lib/hooks.ts` is a shared file)
- `make e2e-frontdesk`, `e2e-member`, `e2e-roles`, `e2e-plans`, `e2e-gym` green, run strictly sequentially
- Add-member UI cannot submit without a valid plan; created members always show an Active subscription on their detail page
