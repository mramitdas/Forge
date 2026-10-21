# Gym-side settings redesign — split name, password card, merged gym/role cards

**Date:** 2026-10-21 · **Status:** approved · **Supersedes:** the pre-split
`GymSettings.tsx` layout

## Goal

Bring the non-platform settings page (`/settings` → `GymSettings.tsx`) up to
the standard set by the platform-admin page, and replace its two information-
dense cards (gym profile + branch access; role + permissions) with single
minimal cards. Repo-wide, every native `<select>` gains a dropdown chevron and
timezone options display their UTC offset.

Non-goals: the platform-admin settings UI (frozen — it only inherits the
shared-checklist extraction and the global chevron), the danger-zone button
(dead today, stays dead), and the backend permission model itself.

## Scope of effect

`GymSettings.tsx` is shared by every gym-side role (owner, branch manager,
receptionist, trainer). The dispatcher (`settings/page.tsx`) routes
`me.is_platform` → `PlatformSettings`, everyone else → `GymSettings`. By
decision **A**, the redesigned cards render for **all gym-side roles**, each
seeing their own role name and their own (partially-lit) permission pills. The
gym-profile card remains gated on `can("tenancy.settings.manage")` — in
practice owner-only, unchanged from today.

## Card order (new)

```
Profile                     (all users)
Password                    (all users)
Gym profile & access        (tenancy.settings.manage — owner)
Role & permissions          (all gym users)
Danger zone                 (unchanged)
```

## 1. Profile card

- `First name` / `Last name` inputs side-by-side (`grid gap-4 sm:grid-cols-2`),
  ids `#settings-first-name` / `#settings-last-name`, matching PlatformSettings.
- `Email` input `readOnly disabled`, helper text `Email can't be changed.`
  The frontend **stops sending `email`** in the PATCH.
- Seeding mirrors PlatformSettings: split `user.first_name`/`last_name` with a
  `full_name` split-on-first-space fallback.
- Save → `PATCH /auth/me { first_name, last_name }` → `refreshMe(updated)` so
  the sidebar (`aside` renders `me.user.full_name`) refreshes with no reload.
- Subtitle stays **"Your account details across the organization"** — one
  existing e2e locator stays valid.

## 2. Password card

- `PasswordChecklist` is lifted verbatim out of `PlatformSettings.tsx` into a
  shared component (markup byte-identical: `ul[aria-label="Password strength"]`,
  `CHECK_ROWS` labels `Uppercase letter` / `Lowercase letter` / `Number` /
  `Special character` / `At least 8 characters`, ✓/✗ glyphs). Both settings
  variants import it; PlatformSettings behavior is unchanged.
- Three fields `#settings-current-password` / `#settings-new-password` /
  `#settings-confirm-password`, live checklist under the new-password field,
  `Passwords do not match.` line, `Update password` button.
- Submit → `POST /auth/change-password` → `completePasswordChange(tokens)`.
  `INVALID_CURRENT_PASSWORD` renders inline against the current field;
  `PASSWORD_TOO_WEAK` toasts with `details.failed`. This path is identical to
  PlatformSettings and is already covered by pytest for the backend.

## 3. Gym profile & access card (merged, redesigned)

One `Card`, stacked fields, minimal:

- `Gym name` → `#settings-gym-name`.
- `Timezone` → `#settings-timezone`; visible label is
  `formatTimezone(tz)` (e.g. `Asia/Kolkata (+5:30)`), `value` stays the IANA id.
- `Cross-branch access` → existing `Switch`, unchanged semantics, still
  `PATCH /settings { cross_branch_access }`.
- **Branch list (new, display-only):** one row per branch from `me.branches`,
  each showing `name · timezone` and the offset, e.g.
  `Main · Asia/Kolkata (+5:30)`. Editable on `/branches`, not here.
- Save → `PATCH /settings { name?, timezone? }` diffed against a seeded
  snapshot; toast `Gym profile updated`; `refreshMe(prev => ({...prev,
  tenant_name: updated.name}))` so the sidebar gym name updates.

The separate "Branch access" card and its `SettingsBranchSkeleton` wrapper
disappear; the merged card uses a plain `Async`/skeleton.

## 4. Role & permissions card (merged)

```
Role:
┌──────────────┐
│  Gym Owner   │   ← blue accent Badge, value = me.role_name
└──────────────┘

          read   write   update   delete
Attendance  ●✓     ●✓      ○·       ○·
Billing     ●✓     ●✓      ○·       ○·
Expenses    ●✓     ●✓      ●✓       ●✓
…
```

- Header: `Role: <role_name>` where `role_name` is a new `/auth/me` field
  (comma-joins if a user somehow holds several). Rendered as a `Badge
  tone="blue"`.
- One row per **gym module** (every non-platform module from the catalog:
  `tenancy`, `members`, `membership`, `billing`, `expenses`, `attendance`,
  `notifications`, `reports`, `identity`), even when partially granted — a
  receptionist sees an honest mix.
- Four pills per row. Pill = rounded-full toggle-style chip, rendered
  **non-interactive** (`aria-disabled`, no pointer cursor, no handlers): ON =
  filled accent, OFF = muted outline. The owner cannot edit their own
  permissions; this is a read-only summary, replacing the prettified mono-chip
  dump.
- Pill is ON iff the role's effective permission set (from `me.permissions`)
  contains any code mapping to it:

  | Pill | Satisfied by |
  |---|---|
  | read | `*.view`, `export` |
  | write | `create`, `checkin`, `activate`, `capture`, `refund` |
  | update | `update`, `manage` |
  | delete | `delete`, `manage` |

  (`manage` implies full control → all four ON.)

- The old "Your role & permissions" and "Granted permissions" cards are
  removed; this single card replaces both.

## 5. Repo-wide dropdown polish

- `Select` in `components/ui.tsx` already has `appearance-none`; add an inline
  SVG chevron pinned to the far right (`bg-[right_0.6rem_center]`, `pr-8`,
  `bg-no-repeat`). All ~30 usages inherit it, including the frozen
  platform-gyms edit modal — approved as a pure-visual change.
- `lib/timezones.ts`: keep `TIMEZONES: string[]` (IANA ids); add
  `formatTimezone(tz)` deriving the offset via
  `Intl.DateTimeFormat(..., { timeZoneName: "shortOffset" })`, falling back to
  the bare id on error. Consumers render the label; `<option value={tz}>`
  keeps the IANA id so e2e `selectOption("Asia/Dubai")` keeps working.
  Consumers: settings, branches create/edit, platform gyms edit (frozen).

## 6. Backend changes (identity module only)

1. `MeOut` gains `role_name: str | None`; `_me_payload` resolves it from the
   actor's role joins (comma-joined, sorted, if several).
2. `me.branches` entries gain `timezone` (from the Branch row) alongside the
   existing `id`/`name`.
3. Email freeze becomes universal: the `EMAIL_FROZEN` 403 in `PATCH /auth/me`
   drops the `actor.is_platform` condition — **any** attempt to change email is
   rejected. The frontend no longer sends `email`, so this is defense in depth.

No change to `/auth/change-password` (already open to every logged-in user)
or to the permission catalog/role templates.

## 7. E2E and docs (same commit, per AGENTS.md)

- `gym_ops_verify.cjs` settings block (L205–293) is updated in the same
  commit as the UI it pins:
  - profile card located by its subtitle; first field is `#settings-first-name`
    (not `input.first()`); the composed full name is asserted in the sidebar;
  - "Branch access" heading wait → "Gym profile & access";
  - "Granted permissions" wait → "Role & permissions" + one pill assertion;
  - timezone `selectOption` unchanged (IANA values preserved).
  Target: **33/33**.
- The platform Playwright suite (`npx playwright test e2e/platform`) must stay
  100% — it pins the platform checklist markup and the shared `Select`.
- `AGENTS.md`: the "GymSettings.tsx is a verbatim move" contract note is
  replaced with the new card inventory and the gym_ops coupling rule.

## Verification

- `cd backend && .venv/bin/python -m pytest` (+ ruff) — new cases: non-platform
  email change → 403 `EMAIL_FROZEN`; owner `/auth/me` carries `role_name` and
  `branches[].timezone`.
- `cd apps/web && npx tsc --noEmit && npm test` — `passwordChecks` untouched;
  `formatTimezone` gets a unit test.
- `npx playwright test e2e/platform` — 100%.
- `gym_ops_verify.cjs` — 33/33.
- Manual: log in as `demo-owner@gym-erp.dev`, confirm the four cards, the
  offset labels, the chevron on every select, and that pills are inert.
