# Deferred-Fixes Round Design (2026-10-19)

Fixes the seven deferred findings from the bugfix-round final report: two missing
features (roles delete, tenant tier view) plus five hardening areas (billing
pagination, the unlabeled-controls long tail, denied-check-in member stats,
E2E fixture leakage, ordering tiebreakers + in-flight guards + Modal/Toast a11y).
All decisions below were approved interactively before writing.

## Scope (user-approved)

**In:** all 7 deferred findings — roles delete feature; tenant-side tier view on
`/subscriptions`; billing server pagination + SQL summary endpoint (with
server-side `q` search); `id`/`aria-label` on every unlabeled control (≈35
tenant + 20 platform, attribute-only on platform); granted-only member stats
(visits/streak/last check-in); in-script E2E teardown (no historical purge);
standard + focus-trap Modal a11y and a persistent always-mounted Toast live
region; secondary `id` order keys on 9 list endpoints (incl. the platform sold
list, gate-verified); in-flight guards on branches edit + roles save.

**Out (deferred):** historical fixture purge of past E2E runs; backend
member-stats endpoint (the pre-existing `fetchPaged` 2,000-row cap and
permission-dependent stats stay as-is); notifications list pagination;
`(tenant_id, name)` unique constraint on roles; settings `saveProfile` items
(dropped — exploration proved already fixed).

**Approved exceptions:** platform surface edits are attribute-only form
attributes (`id`/`aria-label`) plus two behavior-preserving test/backend
retargets — the platform gate must stay 22/22 after each shared/platform touch
(`components/ui.tsx`, `lib/hooks.ts`, `platform/**`, `tenancy` platform sold
list ordering).

## Issue → fix map

| # | Deferred finding | Fix | Layer |
|---|------------------|-----|-------|
| 1 | Roles have no delete (FE or BE) | `DELETE /permissions/roles/{id}` (soft, 409 in-use, refuse locked) + confirm-dialog UI | BE+FE |
| 2 | No tenant tier view | `GET /subscriptions/tier` + read-only "Gym plan" card on `/subscriptions` | BE+FE |
| 3 | Billing loads all invoices (1,965 rows, no pager) | Server paging (`OffsetPagination`), SQL `GET /invoices/summary`, server-side `q` search, expenses-style pager | BE+FE |
| 4 | Unlabeled controls long tail (Chrome a11y issues) | Per-control `id` + `aria-label` (approach A), platform attribute-only + gate | FE |
| 5 | Member stats count denied/duplicate attempts | `result === "allowed"` filter at the single derivation point (`adapters.ts:153`) | FE |
| 6 | E2E scripts leak fixtures every run | `finally` teardown in frontdesk/gym_ops/member_account; platform tier test retargets its own gym | E2E |
| 7 | Misc review items | 9 order tiebreakers; in-flight guards on `saveEdit`/`save`; Modal Escape/close/ARIA/focus-trap; Toast persistent live region (portal, zero call-site changes) | BE+FE |

## 1. Roles delete design

Roles live in the **identity** module (`/permissions/roles`, not tenancy).

**Backend** (`identity/api.py` after POST :201; `identity/service.py`):
- Route `DELETE /permissions/roles/{role_id}`, `require_permission("roles.manage")`.
- `delete_role(session, role_id, tenant_id, actor)` rules, in order:
  1. Unknown or already-deleted (tenant-scoped) → 404 standard error.
  2. `not role.is_editable` → `ROLE_LOCKED` error (mirrors `update_role` :333;
     never gate on `is_system` — `_seed_roles` defaults it to True for every
     seeded role, `tenancy/service.py:127`).
  3. `user_roles` assignment count > 0 → **409** `{code: "ROLE_IN_USE", message}`
     naming the count (user decision: block when in use; DB cascade never runs).
  4. Otherwise soft-delete (`deleted_at`/`deleted_by` via `SoftDeleteMixin`).
     `get_effective_permissions` already joins `deleted_at IS NULL` (:267), so
     the role's permissions revoke immediately; `role_permissions` rows remain
     harmlessly (FK is `ON DELETE CASCADE` for the hard-delete path only).
- No permission-catalog change: reuse `roles.manage` (no `roles.delete` exists).

**Frontend** (`roles/page.tsx`, `lib/hooks.ts`):
- `useDeleteRole` mirroring `useDeletePlan` (`hooks.ts:165-174`) →
  `apiFetch<void>("/permissions/roles/{id}", {method: "DELETE"})`, invalidate
  the roles query.
- Ghost-red Delete button in the card header action slot (:202-211), rendered
  only when `role.is_editable`; confirm `Modal` copying the plans idiom
  (`plans/page.tsx:673-687`): `Delete {name}?`, body warning that assigned
  users lose this role, footer Cancel + danger "Delete role" (disabled while
  pending). Success toast `{name} deleted`; error toast surfaces the server
  message (`ROLE_IN_USE` / `ROLE_LOCKED`) through the existing api.ts unwrap.
- Latent-bug fix in the same page: `save()` (:82-94) gets an in-flight guard in
  the `addGuard` style (:123-135) — today a double-click fires two PATCHes that
  each delete+reinsert `role_permissions`.

## 2. Tenant tier view design

**Backend** (tenant route; nothing owns `/subscriptions` today):
- `GET /api/v1/subscriptions/tier` in `tenancy/api.py`, gated
  `require_permission("membership.subscriptions.view")` — the page's own
  permission (owner + receptionist see it; trainer has no Subscriptions nav and
  never requests it).
- Response `TenantTierOut` (`tenancy/schemas.py`): `tier_code, tier_name,
  description, price_minor, max_branches, max_members, branches_used,
  members_used, gym_status`. Source: `Gym.tier_code` (:40) → `subscription_tiers`
  by code; usage = live (non-deleted) branch and member counts for the tenant.
- Missing tier row (code drift) → graceful fallback: `tier_name = tier_code`,
  null price/limits; UI renders "Unlimited" only for genuinely null limits.

**Frontend** (`subscriptions/page.tsx`, `hooks.ts`):
- `useTenantTier()` → `apiFetch<TenantTierOut>("/subscriptions/tier")`, query key
  `["tenant-tier"]`, `enabled: can("membership.subscriptions.view")`.
- Read-only "Gym plan" card above the member-subscriptions table: tier name,
  price, `branches_used of max_branches`, `members_used of max_members`
  (null max → "Unlimited"), gym status badge. No mutations, no new nav entry.

## 3. Billing pagination design

**Backend** (`billing/api.py:21-35`, `billing/service.py:117-126`):
- `GET /invoices` → `{items, total, page, page_size}` via `OffsetPagination`
  (`kernel/pagination.py`), params `page` (≥1, default 1), `page_size`
  (1–100, default 20), existing `member_id` kept, new `q` (case-insensitive
  match on invoice number or member first/last name — members-page search idiom).
  **Response-shape change:** the two scripts reading this endpoint
  (`frontdesk_verify.cjs:103`, `gym_ops_verify.cjs:292/329`) switch to `.items`
  (and pass `page_size=100` where they want a full slice) in the same commit.
- Ordering: `Invoice.issue_date.desc(), Invoice.id.desc()` (stable tiebreak).
  Per-row line loads stay (≤100 rows/page vs 1,965 today).
- New `GET /invoices/summary` (perm `billing.invoices.view`) →
  `{outstanding_minor, collected_minor, overdue_minor}`, summed in SQL over
  live rows: outstanding = `total − paid` for `open`/`partial` (void excluded);
  collected = `paid` for `paid`; overdue = residual for `open`/`partial` with
  `due_date < now()` (Bug-10 semantics: past-due partial counts). Empty → zeros.

**Frontend** (`billing/page.tsx`, `hooks.ts`):
- `useInvoicesPage({page,pageSize})` mirroring `useExpensesPage`
  (`hooks.ts:506-531`, `placeholderData: keepPreviousData`) and
  `useInvoiceSummary()` (separate `["invoices","summary"]` query).
- Pager = the expenses idiom (`expenses/page.tsx:69-81, 184-195`): local page
  state, `PAGE_SIZE = 20`, clamp effect, "Page X of Y" + Previous/Next.
- SummaryCards consume the SQL summary (no client reduce over all rows);
  `N of total` count badge uses `total`.
- Search box (existing `billing-search` input) debounces into the `q` param —
  server-side search across all pages (user-approved refinement).

## 4. Hardening design (a11y, guards, tiebreakers, visits)

**Unlabeled controls (approach A — per-control attributes):**
- Tenant-side, add `id` (kebab-case) + `aria-label` matching the visible Field
  label, per the `fa3e0e5` convention: `members/page.tsx` 164/328/340/34;
  `members/[id]/page.tsx` 550/560/590/55 + inputs 514/521/528/542/623;
  `checkins/page.tsx` 217/224; `(app)/page.tsx` 153/188/196;
  `branches/page.tsx` 311/370/47 + the 10 modal inputs (295-395).
- Platform-side, attribute-only on all 20 controls (`platform/gyms/page.tsx`
  220-291, `platform/owners/page.tsx` 148-154, `platform/subscriptions/page.tsx`
  129-177, bare inline Tier select `platform/page.tsx:141` gets an explicit
  `aria-label="Tier"`). No layout/behavior change; **platform gate 22/22 after.**

**Modal (shared `components/ui.tsx:316-352`):**
- Escape closes (keydown while open → `onClose()`); X close button
  (`aria-label="Close"`, top-right); `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` pointing at the title node; focus moves into the dialog on
  open, Tab cycles within it (focus trap), focus restores to the trigger on
  close. Backdrop-click and Cancel behavior unchanged — the e2e comment
  (`expenses_verify.cjs:90` "close via Cancel button") remains true.

**Toast (shared `components/ui.tsx:363-387`):**
- Root cause: pages render `{toast && <Toast/>}`, so the `role="status"` live
  region mounts together with its content. Fix with **zero call-site changes**
  (platform pages stay frozen): `ui.tsx` creates a singleton empty
  `role="status" aria-live="polite" aria-atomic="true"` region on
  `document.body` at module load (guarded `typeof document !== "undefined"` for
  SSR), and `Toast` renders via portal into that pre-existing region. The
  region exists from app start → content changes are announced reliably.
  Dismiss button keeps `aria-label="Dismiss"`.

**In-flight guards:** branches `saveEdit` (`branches/page.tsx:110-131`) and
roles `save` (`roles/page.tsx:82-94`) get the synchronous `addGuard`-style
guard (see §1). Settings forms already guarded (stale premise dropped).

**Ordering tiebreakers (secondary `id` key, additive):**
`attendance/service.py:186`, `members/service.py:226`, `billing/service.py:125`
(lands with §3), `membership/service.py:373`, `notifications/service.py:55`,
`tenancy/service.py:572`, `tenancy/service.py:639` (**platform** sold list —
user-approved with gate), `members/service.py:241`, `membership/service.py:95`.

**Member stats (approach A — FE filter):**
`lib/adapters.ts:153` → `ctx.checkins.filter((c) => c.member_id === m.id &&
c.result === "allowed")`. Single derivation point covers `visits` (:176),
`streak` (`computeStreak`, :128-144), and `lastCheckIn` (:154-158/175).
Denied/duplicate rows remain visible in the Check-ins feed. Known pre-existing
limitations unchanged: `fetchPaged` caps at 2,000 rows; users without
`attendance.records.view` see 0 visits (deferred to report).

## 5. E2E teardown design

Teardown runs in each script's `finally`, as **checks** (a leak fails the run),
using API DELETEs with the script's existing token (re-login on 401):

| Script | Capture | Delete | Baseline |
|--------|---------|--------|----------|
| `frontdesk_verify.cjs` | member A/B IDs, plan A/B IDs (:79-90) | 2 members (cascades subs/invoices/payments/check-ins), 2 plans | 23 → 27 |
| `gym_ops_verify.cjs` | `E2E Role` ID (:155-162), conditional fixture member+plan IDs (:283-315) | role (new §1 endpoint); member+plan **only when that conditional block ran** (checks gated on captured IDs) | 30 → 31, up to 33 |
| `member_account_verify.cjs` | `Renew Plan`/`Upgrade Plan` IDs (:69-98) | 2 plans (member already deleted mid-test) | 13 → 15 |
| `platform_admin_verify.cjs` | — (restructure) | tier test (:133-137) moves **before** gym deletion and targets the Verify Gym row by `hasText` — no foreign gym mutated | 22 (unchanged) |

Notifications have no delete endpoint → excluded (unread sweep covers them).
`plans`/`expenses`/`role_visibility` scripts are already clean.

## 6. Error contract, testing, sequencing

**Errors:** all new failures return `{"error": {code, message}}` —
`ROLE_IN_USE` (409), `ROLE_LOCKED` (existing error type/code), 404 unknown
role; tier fallback on missing row; summary zeros on empty; page clamp mirrors
expenses; Toast region creation client-guarded.

**Testing (TDD where backend):**
- pytest: roles-delete matrix (ok / in-use 409 / locked / cross-tenant 404 /
  list excludes); billing page+`q`+summary buckets (past-due partial → overdue,
  void excluded, tie-stable order); tier endpoint shape/usage/403/fallback;
  tiebreaker stability for members/check-ins/billing.
- FE unit: granted-only stats (`npm test` 8 → 9).
- e2e: contract `.items` updates + search/summary/tier-card checks + teardown
  checks per §5; platform gate after every shared/platform touch.
- Final: full battery — pytest + ruff, `tsc --noEmit`, `npm test`, all seven
  e2e scripts at their new baselines, platform gate 22/22.

**Commit sequence:** roles-delete API → roles-delete UI → tier endpoint → tier
card → billing endpoints+tests → billing UI+script contracts → tenant a11y
attrs → platform a11y attrs + gate → Modal/Toast + gate → backend
tiebreakers + tests → in-flight guards → granted-only stats → e2e teardowns →
full battery + final report update.
