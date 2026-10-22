# Member status: 3-value enum (active / inactive / frozen) — design

Date: 2026-10-22
Status: approved (user: "looks good proceed")

## Goal

The member status dropdown exposes exactly three values — **Active**,
**Inactive**, **Frozen** — replacing the current six-value backend enum
(`lead, prospect, active, frozen, lapsed, cancelled`). Full cleanup, not a
UI-only shim.

## Decisions (user-confirmed)

1. **Replace the enum entirely** — backend `MEMBER_STATUSES` becomes
   `("active", "inactive", "frozen")`; existing rows are migrated.
2. **New members are created `active`** — no more lead default, no manual
   activation step.

## Data migration (alembic `0021`, data-only)

| old status | new status |
|---|---|
| `lead`      | `active`   |
| `prospect`  | `active`   |
| `active`    | `active`   |
| `lapsed`    | `inactive` |
| `cancelled` | `inactive` |
| `frozen`    | `frozen`   |

- Column stays `String(20)` with its existing index — no schema change.
- Also rewrites legacy `custom_data->'branch_frozen_prev'` values with the
  same mapping. Branch disable stores the previous status there
  (`tenancy/service.py`); the restore guard
  `previous not in MEMBER_STATUSES` would otherwise silently skip members
  frozen under the old vocabulary and leave them frozen forever.
- The table has `FORCE ROW LEVEL SECURITY` — the migration must run the
  `SELECT set_config('app.platform_scope', 'on', false)` GUC pattern from
  migration `0020`, otherwise the UPDATE matches 0 rows.
- `joined_at`: unchanged logic (`now` when status is `active`), but because
  the create default flips from `lead` to `active`, new members now get
  `joined_at` at create time. No test asserts the old NULL behavior.

## Backend changes

- `backend/app/modules/members/models.py`
  - `MEMBER_STATUSES = ("active", "inactive", "frozen")`
  - column `default="active"`
- `backend/app/modules/members/schemas.py` — `MemberCreate.status: str = "active"`.
- `_validate_status` (service.py) is unchanged — it is already the single
  validation choke point; rejected values raise `ConflictError`
  `INVALID_STATUS` → HTTP 409.
- `backend/app/modules/tenancy/service.py:481` branch-disable guard
  `status not in {"frozen", "lapsed", "cancelled"}` → `status == "active"`.
  Post-migration this is the exact equivalent: active+lead+prospect were
  frozen before, lapsed/cancelled skipped.
- `backend/scripts/import_gms.py:212` — `"cancelled"` → `"inactive"`.
- Explicitly unchanged: check-in guard blocks `frozen`
  (attendance/service.py:86); subscription activation still forces
  `member.status = "active"` (membership/service.py:266); list filter still
  matches exact status strings.

## Frontend changes

- **Edit dropdowns** (detail modal `[id]/page.tsx:576-581`, list-row modal
  `page.tsx:553-558`): options become Active / Inactive / Frozen.
- **Create modal** (`members/page.tsx`): drop `status: "lead"` (backend
  default now active); subtitle → "Members can subscribe to a plan later.";
  toast → `"{name} added"`.
- **Filter chips** (`members/page.tsx:54-61`):
  `["All", "active", "inactive", "frozen"]`; `statusParam` remap table
  (`paused→frozen`, `expired→lapsed`, `lead→lead`) disappears — chips pass
  raw values.
- `mock.ts` — `MemberStatus` type → `"active" | "inactive" | "frozen"`;
  `adapters.ts` `mapMemberStatus` becomes pass-through (unknown → `active`).
- **Shared `components/ui.tsx` `statusTone`** (additive, existing cases
  untouched so platform/admin surfaces are byte-for-byte unchanged):
  - `frozen` → amber (continuity: frozen members previously rendered amber
    via the mapped label "Paused")
  - `inactive` → red (continuity with expired/red)
  - `active` → green already
- `plans/page.tsx:126` — drop `.filter(m => m.status !== "lead")` (no-op).
- `[id]/page.tsx:411` — subscription badge fallback `?? "lead"` → `?? "pending"`.

## Tests

- Update `prospect`/`lead` status literals to migrated values in:
  `test_auth.py:411`, `test_isolation.py:31`, `test_members_search.py:38,53`
  (these also filter by `status=prospect` — use `inactive` so they still
  differ from the `active` default), `test_order_tiebreakers.py:45`,
  `test_slice.py:55,69`, `test_tenant_tier.py:43`.
- New regression test: `PATCH /members/{id}` with `status: "lead"` →
  409 `INVALID_STATUS`.
- E2E fixtures already create members with explicit `status: "active"`
  (frontdesk, member_account, gym_ops) — no fixture changes expected; the
  member edit e2e saves a form whose status select value `active` still
  exists among the three options.

## Gates (all required before commit)

`pytest` (+1 test) · `ruff check` · `npx tsc --noEmit` · `npm test` ·
`make e2e` (shared `ui.tsx` touched) · `make e2e-frontdesk` ·
`make e2e-member` · `make e2e-roles` · `make e2e-plans` · `make e2e-gym`.

Dev DB: `backend/.venv/bin/alembic upgrade head` after writing `0021`.

## Out of scope

- The separate `is_active` Disable/Enable mechanism stays as-is
  (orthogonal to status; detail header keeps its "Disabled" badge).
- Historical timeline event payloads keep their old status strings
  (display-only, immutable events).
- `statusTone` cases for other vocabularies (`paused`, `lead`, …) are left
  in place — subscriptions/billing share that helper.
