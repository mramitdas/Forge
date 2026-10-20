# Super-admin Playwright suite + AGENTS.md gate — design

**Date:** 2026-10-20
**Status:** approved
**Replaces:** `apps/web/e2e/platform_admin_verify.cjs` (retired at implementation)

## Goal

Give the super-admin (platform) surface a proper `@playwright/test` suite at
full depth, and encode a single AGENTS.md rule: any change to super-admin
surfaces or the shared files they depend on must run the suite to 100% and
update stale tests in the same commit.

Out of scope: `/platform/revenue` (explicitly excluded by the user); the other
six e2e scripts (`gym_ops`, `plans`, `member_account`, `role_visibility`,
`frontdesk`, `expenses`) stay house-style, untouched.

## Decisions (user-ratified)

1. **Runner:** migrate to `@playwright/test` proper (spec files, fixtures,
   storageState, native reporters) — not the house `check()`/`must()` style.
2. **Modules in scope:** overview (`/platform`), gyms, owners, subscriptions,
   settings (`PlatformSettings` via `/settings`), impersonation. Revenue out.
3. **Retire** `platform_admin_verify.cjs` into the new suite; the new suite is
   the frozen-surface gate. Other six scripts untouched.
4. **Depth:** full — happy paths + validation/error states + guard paths +
   state-matrix checks (~105-125 tests).
5. **AGENTS.md rule:** one absorbed rule (shared-files gate + platform-module
   changes + "update stale tests in the same commit"), one command.
6. **Architecture:** shared auth storageState + per-module spec files +
   throwaway data with cleanup; subscriptions serial internally.

## Infrastructure

- `apps/web/playwright.config.ts` (new):
  - `testDir: "e2e"`, `testMatch: "**/platform/**/*.spec.ts"` (plus the auth
    setup file wired as a project).
  - chromium-only project; `baseURL: http://localhost:3000`.
  - `retries: 1` (known first-nav login-timeout flake class); `trace:
    on-first-retry`.
  - Reporters: `list` + `html` (`open: "never"`).
  - **No `webServer` block** — e2e runs against the already-running `make dev`
    (`:8000`) / `make web` (`:3000`) servers, per repo convention. Config
    comment documents this.
- `@playwright/test` added to `apps/web` devDependencies. The existing seven
  scripts continue to use the globally-installed `playwright` via
  `NODE_PATH="$(npm root -g)"` — untouched.
- npm scripts in `apps/web/package.json`:
  - `"test:e2e:platform": "playwright test e2e/platform"` — the gate command.

## File layout (`apps/web/e2e/platform/`)

| File | Role |
|---|---|
| `auth.setup.ts` | Logs in as `admin@gym-erp.dev` / `admin-pass-123` once per run; saves `storageState` under `test-results/.auth/admin.json`. |
| `fixtures.ts` | Shared helpers: unique-suffix generator, `provisionGym(page, …)` (opens modal, fills, submits, waits for toast), toast-wait helper, cleanup helpers (soft-delete gym via UI). |
| `overview.spec.ts` | `/platform` dashboard. |
| `gyms.spec.ts` | `/platform/gyms`. |
| `owners.spec.ts` | `/platform/owners`. |
| `subscriptions.spec.ts` | `/platform/subscriptions` — `test.describe.configure({ mode: "serial" })` because tier enable/disable/delete state is shared across tests. |
| `settings.spec.ts` | `/settings` (`PlatformSettings` — platform branch of the dispatcher). |
| `impersonation.spec.ts` | gyms → Impersonate → member view → Exit. |

`e2e/platform_admin_verify.cjs` is deleted; its 35 non-revenue checks are
ported into the spec files (the 3 revenue checks are dropped by scope).

## Test-data strategy

- Per-file unique suffix `Date.now().toString(36)`; throwaway gyms named
  `PW Gym {ts}` with slug `pw-{ts}` and throwaway owner emails
  `pw-owner-{ts}@gym-erp.dev`.
- Cleanup:
  - Provisioned gyms are soft-deleted via the UI in `afterAll` (or in the
    delete test itself when the flow covers hard-delete).
  - Test-created tiers are deleted in `afterAll`.
  - Password-reset tests only ever rotate **throwaway** owner passwords
    (created by the provision fixture) — rotation needs no restore.
  - **Settings name save restores the seeded name in `try/finally`** (shared
    admin fixture `admin@gym-erp.dev` / full_name `Platform Admin` must
    survive for every later run).
  - **Never submit a real password change for the admin** — the password card
    is state-tested only (checklist transitions, button gating, mismatch
    hint). The API success path stays covered by pytest
    (`test_change_password_accepts_strong_new`).
- Parallelism: spec files run in parallel (default workers); only
  `subscriptions.spec.ts` opts into serial mode. No other file touches tier
  state.

## Depth matrix (option B, full)

| Module | ~Tests | Beyond happy path |
|---|---|---|
| Overview | 8-10 | stat cards render, nav targets resolve, sane empty/loading states |
| Gyms | 30-35 | provision + each modal validation, edit fields (timezone/currency/name/slug), suspend/enable, soft-delete→restore, hard-delete, search + no-results, status badges |
| Owners | 20-25 | list renders seeded owner, edit name, password reset happy + weak-password error surfaced, disable/enable + blocked-access state, validation |
| Subscriptions | 25-30 | tier CRUD + validation, in-use disable guard (stays enabled), in-use delete guard, enable always allowed, restore-attach flow, price/billing-interval rendering |
| Settings | 12-15 | the current 8 settings checks + empty-first-name blocked, unicode name save, mismatch hint, full checklist weak→strong transition matrix |
| Impersonation | 10-12 | enter/exit, nav swap to member view, scoped permissions, disabled gym/owner blocks impersonation (**plan step: verify the UI actually exposes a blocked path — e.g. Impersonate button absent/hidden for disabled gyms; if the UI has no such path, pin the nearest observable behavior — disabled rows don't render the Impersonate action — and leave the API-level block to pytest**) |
| **Total** | **~105-125** | |

## AGENTS.md change

Replace current Rule 3 with one rule (wording finalized at implementation):

> After **any** change to super-admin surfaces (`/platform/**`, the settings
> dispatcher / `PlatformSettings.tsx`) **or** shared files
> (`components/ui.tsx`, `components/skeleton*`, `lib/hooks.ts`, `lib/api.ts`,
> `(app)/layout.tsx`), run:
>
> ```bash
> cd apps/web && npx playwright test e2e/platform
> ```
>
> 100% pass required. If a legitimate UI change breaks a test, **update the
> test in the same commit**. (`platform_admin_verify.cjs` retired; the other
> six e2e scripts remain house-style gates for their own domains.)

Add a short "Playwright platform suite" section documenting: file layout, the
gate command, data-hygiene rules (restore admin name, never submit admin
password change, throwaway cleanup), and that API-level guarantees stay in
pytest.

The frozen-surface section keeps its list and its carve-out; only the gate
command and the stale-test clause change.

## Risks / trade-offs (accepted)

- Runtime ~1.5-3 min per full run (auth setup amortized across parallel files).
- `retries: 1` can mask a one-off flake — accepted against the known flake
  class; traces are captured on retry for diagnosis.
- Loss of the single-scrollable-file readability of the old script — replaced
  by per-module files + the Playwright HTML report.
- Deleting the old script is a one-way door for anyone with the old command
  muscle memory — mitigated by the AGENTS.md rule naming the new command.

## Success criteria

- `npx playwright test e2e/platform` green (~105-125 tests) against running
  dev servers.
- `platform_admin_verify.cjs` gone; other six e2e scripts byte-identical.
- Battery: `pytest` 105, `ruff` clean, `tsc` clean, unit 17, the six remaining
  house scripts, and the new platform suite — all green.
- AGENTS.md single-rule gate live, with the stale-test clause.
- Shared fixtures survive the suite: admin name/email/password unchanged,
  seeded tiers intact, no orphaned PW gyms in the live list.
