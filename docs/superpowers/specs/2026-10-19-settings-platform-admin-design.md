# Settings Redesign (Platform Admins) — Design

Date: 2026-10-19
Status: Approved

## Goal

Rework the `/settings` page **for platform admins only**:

- Profile section splits full name into First name / Last name; email frozen.
- New password section: current + new + confirm, with a live strength checklist.
- Remove "Your role & permissions" and "Granted permissions" sections.

Gym users keep the existing page unchanged (byte-for-byte).

## Decisions (from Q&A)

| Question | Decision |
|----------|----------|
| Scope | Platform admins only (`me.is_platform`); gym users unchanged |
| Name storage | New `first_name`/`last_name` columns on `users`; `full_name` kept in sync |
| Password inputs | 3 fields: current, new, confirm (backend requires `current_password`) |
| Strength rules | UI checklist **and** backend enforcement on `POST /auth/change-password` |
| Email freeze | UI read-only **and** backend rejection for platform actors |
| Page structure | Approach B: dispatcher page + separate `PlatformSettings` / `GymSettings` components |

## 1. Data model & migration

- `users` (identity module) gains:
  - `first_name: String(100)` (NOT NULL, `server_default ""`, backfilled; app sets a value on every write path)
  - `last_name: String(100)` (NOT NULL, `server_default ""`, backfilled; may be `""`)
- Alembic migration:
  - Add both columns.
  - Backfill: split `full_name` on first space — `"Ada Lovelace"` → `Ada` / `Lovelace`; single-word → `first_name = full_name`, `last_name = ""`.
- `full_name` column **stays** and is recomputed (`f"{first_name} {last_name}".strip()`) on every write path that touches the name (update-me, seed/provision, admin flows if any). All existing readers (sidebar, e2e, employee lists) keep working unchanged.
- Mirrors the members-module pattern (`members.first_name` + `members.last_name`).

## 2. Backend

### Schemas (`identity/schemas.py`)

- `MeUpdateRequest` adds:
  - `first_name: str | None = Field(default=None, min_length=1, max_length=100)`
  - `last_name: str | None = Field(default=None, min_length=0, max_length=100)` (allow empty string; strip)
- `UserOut` (embedded as `MeOut.user`, also on `/employees`) adds `first_name: str`, `last_name: str` (seeded from user row; `""` when unset).

### Service (`identity/service.py`)

- `update_me`:
  - If `first_name`/`last_name` provided: validate (first must be non-empty after strip), set, recompute `full_name`.
  - If legacy `full_name` provided: keep existing behavior **and** also split into `first_name`/`last_name` (keeps columns in sync for gym-path saves).
  - **Email freeze**: if `actor.is_platform` and body contains `email` that differs from current → `403` `EMAIL_FROZEN` (enforced in the API route before the service call). Gym actors keep current behavior ( uniqueness checks etc.).
- Password rules: pure function `password_rule_failures(pw: str) -> list[str]` returning failed rule codes among `["uppercase", "lowercase", "digit", "special", "length"]`.
  - Enforced service-level in `change_password`, after current-password verification: failures → `422` `PASSWORD_TOO_WEAK` with the failed codes in `details.failed` (app `{"error": {...}}` envelope).
  - Rules: ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special char (non-alphanumeric), length ≥ 8.
  - Implementation note: `new_password` drops the field-level `min_length=8` (keeps `max_length=128`) so short passwords flow through the service check and get the consistent `PASSWORD_TOO_WEAK` + `["length", ...]` envelope instead of a generic Pydantic length error. `current_password` keeps its `min_length=8`. Current-password check runs first, so wrong-current keeps `INVALID_CURRENT_PASSWORD` regardless of new-password strength.
  - Scope: **change-password endpoint only**. Login, employee-create, provision-owner, owner-reset flows untouched.

### API (`identity/api.py`)

- No route changes; `PATCH /auth/me` and `POST /auth/change-password` contracts extended as above.

## 3. Frontend

### Structure (Approach B)

- `src/app/(app)/settings/page.tsx` → thin dispatcher:
  ```tsx
  return me?.is_platform ? <PlatformSettings /> : <GymSettings />;
  ```
- `src/app/(app)/settings/PlatformSettings.tsx` (new):
  - **Profile card**
    - Inputs: `#settings-first-name`, `#settings-last-name` (seeded from `me.user.first_name` / `last_name`).
    - Email: `#settings-email` rendered `readOnly`/`disabled` + hint "Email can't be changed".
    - Save → `PATCH /auth/me { first_name, last_name }` → `refreshMe(updated)` → toast "Profile updated". Re-seed from server response.
    - `403 EMAIL_FROZEN` → toast "Email can't be changed" (defense in depth; field is disabled so mainly API path).
    - `422` → toast with server message.
  - **Password card** (new)
    - Fields: `#settings-current-password`, `#settings-new-password`, `#settings-confirm-password` (all `type="password"`).
    - Live checklist under new password, driven by `passwordChecks()`:
      - Uppercase letter
      - Lowercase letter
      - Number
      - Special character
      - At least 8 characters
      - Each row shows ✓/✗ live; overall pass = all five true.
    - Submit disabled until: all five pass AND new === confirm AND current non-empty.
    - On submit: `POST /auth/change-password` → on success feed returned tokens into auth context (same pattern as `/change-password` page: `completePasswordChange(tokens)`), toast "Password updated", clear fields.
    - `INVALID_CURRENT_PASSWORD` → inline error under current-password field.
    - `PASSWORD_TOO_WEAK` (422) → toast listing failed rules (client blocks this; API defense only).
  - No role/permissions, granted-permissions, gym-profile, or danger-zone sections.
- `src/app/(app)/settings/GymSettings.tsx` (new): today's page content moved **verbatim** (Profile full-name+email, Your role & permissions, Granted permissions, Gym profile, Branch access, Danger zone). All existing labels, ids, and selectors preserved so `gym_ops_verify.cjs` passes untouched.
- `src/lib/password.ts` (new): pure `passwordChecks(pw: string): { checks: PasswordChecks; failed: PasswordRule[] }` where rule keys are exactly the backend codes `uppercase | lowercase | digit | special | length` (keep in sync with `password_rule_failures`); `allChecksPass(result)` helper.
- `src/lib/password.test.ts` (new): node:test unit matrix (empty, partial rules, all-pass, unicode edge).
- `PasswordChecklist` small component colocated in `PlatformSettings.tsx` (or imported sibling).

### Hooks

- Reuse `useUpdateMe`. Password call: add a small `useChangePassword` hook in `src/lib/hooks.ts` (shared file → run platform e2e gate after touching it), or call `apiFetch` directly from the component; prefer the hook for consistency.

## 4. Error handling

| Case | Behavior |
|------|----------|
| Platform actor PATCHes changed email | `403 EMAIL_FROZEN` → toast "Email can't be changed" |
| Weak new password (API) | `422 PASSWORD_TOO_WEAK` + failed rules → toast |
| Wrong current password | `409/422 INVALID_CURRENT_PASSWORD` → inline error |
| Empty first name | client blocks submit; server 422 |
| new ≠ confirm | client blocks submit |

## 5. Testing

- **Backend pytest** (`tests/test_identity_*.py` or existing auth tests):
  - update-me with first/last → columns set, `full_name` recomputed, `MeOut.user` returns all three.
  - update-me legacy `full_name` → split into first/last as well.
  - platform actor changes email → 403 `EMAIL_FROZEN`; gym actor changes email → 200.
  - change-password weak new → 422 `PASSWORD_TOO_WEAK` with failed codes; strong → 200 and login with new password works.
- **FE unit**: `npm test` includes `password.test.ts`.
- **E2E**:
   - `platform_admin_verify.cjs` +checks (Settings section): page shows First name/Last name seeded; email disabled; save name persists (toast + sidebar updates via refreshMe, then restores the seeded name); password checklist flips live; weak submit blocked (button disabled); strong password enables the button — **no real submission** (the admin fixture password must survive for the other e2e scripts; the API success path is covered by pytest).
  - `gym_ops_verify.cjs`: **untouched**, must stay green.
- Full battery after (platform gate mandatory if `hooks.ts`/`ui.tsx`/`layout.tsx` touched).

## Non-goals

- Danger-zone Deactivate stub stays a stub.
- `/change-password` must-change flow page untouched (its backend now enforces strength — acceptable, same rules).
- Employee-create / provision-owner / owner-reset password fields: no strength UI or new validation.
- No platform-admin-specific settings route; still `/settings`.
- No phone/other profile fields.

## Frozen-surface note

- No changes under `platform/**` pages or `/api/v1/platform/*`.
- Shared files possibly touched: `src/lib/hooks.ts` (new hook) → run `platform_admin_verify.cjs` gate (must stay 100%).
- Settings page is not in the frozen list but gym path must remain behavior-identical (gym_ops e2e is the contract).
