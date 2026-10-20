# AGENTS.md

## Platform admin panel is FROZEN for v1

The platform admin console is locked for v1. Treat it as a frozen surface:
no changes to its behavior, layout, routes, or data contract without explicit
user approval.

### Frozen surface

- Pages: `apps/web/src/app/(app)/platform/**` (overview, gyms, owners,
  subscriptions/tier cards, revenue) and the platform nav in
  `apps/web/src/app/(app)/layout.tsx`.
- Backend API: every `/api/v1/platform/*` route and its request/response
  schemas in `backend/app/modules/tenancy/` (service, api, schemas, models).
- Migrations that add/alter platform-admin tables (subscription_tiers,
  gym_subscription_events).
- **Carve-out (ratified):** `tenancy/service.py` name-column syncs in
  `provision_gym`/`update_owner` (writes `users.first_name`/`last_name` on
  owner create/update) are exempt — spec-required, behavior-preserving; do not
  extend this carve-out to other tenancy behavior.

### Rules

1. Do not modify any file under the frozen surface unless the user explicitly
   asks to change the platform admin panel.
2. When a task requires touching shared files that the panel depends on
   (`apps/web/src/components/ui.tsx`, `components/skeleton*.tsx`,
   `lib/hooks.ts`, `lib/api.ts`, `(app)/layout.tsx`), the panel's behavior
   must remain byte-for-byte identical.
3. After ANY change to shared files listed above (even unrelated to the
   panel), run the regression gate before finishing:

   ```bash
   cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
   ```

   All checks must pass (100%, currently 38/38 — includes the Settings
   section: split-name save with fixture restore, frozen email, live password
   checklist; it never submits a real password change). This script provisions
   and deletes a throwaway gym, exercises gym/owner management, tier CRUD,
   settings, and the revenue chart, so it also validates the backend
   `platform_*` API.

## Settings page is role-split

`apps/web/src/app/(app)/settings/page.tsx` is a dispatcher: platform admins
(`me.is_platform`) get `PlatformSettings.tsx`, everyone else gets
`GymSettings.tsx`.

- `GymSettings.tsx` is a **verbatim** move of the pre-split settings page —
  its selectors are a contract with `e2e/gym_ops_verify.cjs` (33/33). Any
  selector/label/id change there breaks the gym gate.
- `PlatformSettings.tsx` (platform only): split first/last name inputs (save
  via `PATCH /auth/me` `{first_name, last_name}`), frozen email
  (readOnly/disabled in UI; backend enforces 403 `EMAIL_FROZEN` for platform
  actors), 3-field password change with live rule checklist. No role,
  permissions, gym-profile, or danger-zone sections (spec §UX).

## Password complexity — keep FE and BE in sync

Rule codes are `uppercase`, `lowercase`, `digit`, `special`, `length` (≥8),
in that order:

- Backend: `password_rule_failures()` in `backend/app/core/security.py` —
  enforced in `change_password` (service-level, AFTER current-password
  verification) → 422 `PASSWORD_TOO_WEAK` with `details.failed`.
- Frontend: `passwordChecks()` in `apps/web/src/lib/password.ts` (unit tests
  in `password.test.ts`). Any rule change must land in BOTH files + both test
  suites. Frontend is deliberately equal-or-stricter on unicode (JS `\d` is
  ASCII-only).

## Test fixture hygiene (weak passwords are now rejected)

The API rejects weak passwords, so tests cannot round-trip shared fixtures
back to passwords like `owner-pass-123` (no uppercase). When a test changes a
shared/session-scoped fixture's password or name:

- Use a strong test password (e.g. `Owner-Pass-123!`).
- Restore via the direct-DB helper pattern (`_restore_password` /
  `_set_must_change` in `backend/tests/test_auth.py`) or a PATCH back to the
  original — and wrap the mutation in `try/finally` so an assert failure
  mid-test cannot poison the session-scoped fixture for later tests.
- Never submit a real password change in e2e scripts (fixtures must survive
  for the other suites); the API success path is covered by pytest.

## Dev servers

- Backend: `make dev` → uvicorn `:8000` `--reload` (health probe:
  `GET /api/v1/auth/me` should 401).
- Frontend: `make web` → Next dev `:3000`.
- E2E scripts run against the RUNNING servers (`NODE_PATH="$(npm root -g)"`
  prefix for Playwright); never restart servers mid-session to "pick up
  changes" — uvicorn/Next hot-reload already do.
