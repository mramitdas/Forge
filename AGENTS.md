# AGENTS.md

> **Read this file fully at the start of every session.** It defines the
> guardrails, workflow, and repo contracts for agents and humans working here.
> Section 1 is the standing policy; sections 2–5 are Forge-specific.

## 1. Guardrails & Boundaries

<!-- Generic guardrails. Repo-specific command mappings are called out inline. -->

### 1.1 Anti-hallucination

- **Cite, never guess.** Every file, function, command, or config an agent
  references must exist in the repo right now — verify by reading before
  acting. No "it should probably be in…" reasoning.
- **No invented APIs.** Never use a library method from memory; read the
  installed package for the pinned version in use. Versions come from the
  manifests, not from recollection.
- **Read before edit.** A file must be fully read (not just grepped) before it
  is edited.
- **Verify before claiming.** Never say "done", "passing", or "fixed" without
  having run the actual command and seen real output.
- **Acknowledge unknowns.** Unsure about an env value, expected behavior, or
  secret? Stop and ask. Never invent credentials, URLs, or DB values.
- **No silent fallbacks.** If a step fails, report the real error verbatim.
  Do not work around it by editing unrelated files.
- **Diff-check after edits.** After every edit, review `git diff` to confirm
  only intended changes.

### 1.2 Scope discipline (no overreach)

- One issue = one PR = one logical change. Strictly implement only what the
  accepted issue defines (its AC).
- No drive-by refactors, renames, or formatting-only edits; no "while I'm in
  here" changes. Spotted problems → create a new issue, do not fix inline.
- No unrequested suggestions at the end of a task. Finish, report, stop.
  Ideas belong in GitHub issues.
- One-way decisions (schema changes, API contracts, migrations) are proposed
  in 1–3 lines and approved before applying.
- Never create `v2`, `copy`, `.new`, `backup`, or `-final` variants of files;
  edit in place.

### 1.3 Issue → branch → PR workflow

- Every task/feature starts as a GitHub issue before any code.
- Branch naming: `<type>/<issue#>-<slug>` (e.g. `feat/12-rate-limiting`).
- One task = one commit: conventional commits (`feat:`, `fix:`, `chore:`,
  `docs:`, `test:`), subject ≤ 50 chars, commit body ends with `refs #N`.
- Work happens on the issue branch; the PR targets `dev`. Promotion is
  sequential and PR-only: `dev` → `stag` → `prod`. Never skip or reorder
  a hop; PRs into `prod` must come from `stag` only, PRs into `stag` from
  `dev` only.
- **PR checklist gates (all required before merge):**
  - tests pass (`make test-backend`, `make test-web` — real command output),
  - `make lint` (ruff), `npx tsc --noEmit`, and `npm run build` clean,
  - no secrets and no `.env` in the diff,
  - acceptance criteria demonstrably met,
  - docs updated if behavior/setup changed,
  - PR targets the correct branch in the chain (`dev` ← branch,
    `stag` ← `dev`, `prod` ← `stag`).
- Issue is closed **only** after its PR is merged. Never close otherwise.
- Never commit or PR directly to protected branches (`prod`, `stag`, `dev`),
  even for docs. No skip-hooks (`--no-verify`), no force-pushing.
- **Never head-delete integration branches.** Merging a PR with
  `gh pr merge --delete-branch` deletes the PR's head branch, so use it
  only for feature/issue branches. PRs whose head is `dev`, `stag`, or
  `prod` (promotion hops) must be merged without `--delete-branch`.
  Feature-branch cleanup is manual or guarded by GitHub branch protection.
- GitHub protection on `prod`/`stag`/`dev` requires a PR plus the CI checks
  `Backend lint + tests` and `Frontend build`; required approvals are 0
  (solo maintainer), so green checks + PR are the merge gate.

### 1.4 Task granularity & tracking

- One task = ≤ 30 minutes of work = one commit = one checkbox in its issue.
- A task exceeding 30 minutes is split into subtasks within the issue.
- Every task has executable acceptance criteria (a test, a command, or a
  demonstrable behavior). Done = AC passes — nothing more, nothing less.
- Feature issues are parents with a task checklist; each item is its own
  branch/PR and ≤ 30 minutes.
- Status is communicated through issue/PR comments, not memory or chat-only.

### 1.5 Security

- Never commit secrets, tokens, API keys, or `.env`; `.env` is git-ignored.
  Real secrets live only in the local `.env` / deployment secret store.
- Dependencies are added/changed only through the requirement manifests
  (`backend/pyproject.toml`; frontend `apps/web/package.json` +
  `apps/web/package-lock.json`); lockfile or pin updates are separate commits.
- Never disable lint, typecheck, or test gates to make something pass.

### 1.6 Destructive & irreversible operations

- The following require explicit, current-session user approval before
  running: `git push --force`, branch deletion (including of integration
  branches `dev`, `stag`, `prod`), dropping/updating-down DB
  migrations, deleting files beyond the current task's scope, publishing or
  releasing, and anything modifying `prod` history.
- Never touch files outside the workspace directory.

### 1.7 On session start

- Read this file first.
- Check open issues and PRs to resume context (`gh issue list`,
  `gh pr list`); rely on issue/PR comments, not memory of a previous session.
- Confirm the target branch (`dev`) and issue number before the first action.
- Confirm the dev servers are up (§2) before running UI or e2e work.
## Branch layout

- `prod` — default/protected branch. **Can be merged only from `stag`.**
- `stag` — staging. **Can be merged only from `dev`.**
- `dev` — integration branch. **Can be merged only from feature/issue branches** (`<type>/<issue#>-<slug>`).
- Feature/issue branches target `dev`. Promotion through the chain happens via PRs only, one hop at a time.
- Remote `origin` is `https://github.com/mramitdas/Forge.git`; all changes land through PRs and no direct pushes to integration branches are permitted.
- Server-side branch protection requires PR + CI checks (`Backend lint + tests`, `Frontend build`); required approvals are 0 (solo maintainer); the branch-flow workflow and PR discipline enforce the flow.




## 2. Repository map & local environment

- `apps/web` — Next.js 15 app-router frontend (client components, TanStack
  Query).
- `backend` — FastAPI + SQLAlchemy async; Alembic revisions in
  `backend/alembic/versions/`.
- `apps/web/e2e` — house-style `.cjs` Playwright scripts;
  `apps/web/e2e/platform` — `@playwright/test` suite.
- `docs/superpowers/{specs,plans}` — design specs and implementation plans.

### Dev servers

- Backend: `make dev` → uvicorn `:8000` `--reload` (health probe:
  `GET /api/v1/auth/me` should 401; `POST /auth/login` with the admin fixture
  should be 200 — a 500 with `UndefinedColumnError` means the DB was
  downgraded/restored behind the code: run `backend/.venv/bin/alembic upgrade
  head`).
- Frontend: `make web` → Next dev `:3000`.
- E2E scripts run against the RUNNING servers (`NODE_PATH="$(npm root -g)"`
  prefix for Playwright); never restart servers mid-session to "pick up
  changes" — uvicorn/Next hot-reload already do.
- If the backend probe returns an unexpected 404 on `127.0.0.1:8000`, check
  for a port squatter (`lsof -nP -iTCP:8000 -sTCP:LISTEN`); the app binds
  `0.0.0.0`.

### Database & migrations

- Postgres; `make db-up` / `make db-init` create the `gym` role and the
  `gym_erp` / `gym_erp_test` databases.
- `make migrate` → `alembic upgrade head`; `make seed` → demo data;
  `make reset` → wipe + migrate + seed.
- pytest runs `alembic upgrade head` on the test DB once per session.
- RLS tables use FORCE ROW LEVEL SECURITY: migrations that touch them must
  run `SELECT set_config('app.platform_scope','on',false);` first (pattern:
  `backend/alembic/versions/0020_fix_is_system.py`).

## 3. Frozen surfaces

### 3.1 Platform admin console is FROZEN for v1

The platform admin console is locked for v1. Treat it as a frozen surface:
no changes to its behavior, layout, routes, or data contract without explicit
user approval.

**Frozen surface**

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

**Rules**

1. Do not modify any file under the frozen surface unless the user explicitly
   asks to change the platform admin panel.
2. When a task requires touching shared files that the panel depends on
   (`apps/web/src/components/ui.tsx`, `components/skeleton*.tsx`,
   `lib/hooks.ts`, `lib/api.ts`, `(app)/layout.tsx`), the panel's behavior
   must remain byte-for-byte identical.
3. After **any** change to super-admin surfaces (`/platform/**`, the settings
   dispatcher / `PlatformSettings.tsx`) **or** shared files
   (`components/ui.tsx`, `components/skeleton*`, `lib/hooks.ts`, `lib/api.ts`,
   `(app)/layout.tsx`), run:

   ```bash
   make e2e
   ```

   (repo root; runs `npx playwright test e2e/platform --workers=1`) — 100%
   pass required. If a legitimate UI change breaks a test, **update the
   test in the same commit**. (`platform_admin_verify.cjs` retired; the other
   seven e2e scripts remain house-style gates for their own domains, run via
   `make e2e-gym` etc.)

### 3.2 Settings page is role-split

`apps/web/src/app/(app)/settings/page.tsx` is a dispatcher: platform admins
(`me.is_platform`) get `PlatformSettings.tsx`, everyone else gets
`GymSettings.tsx`.

- `GymSettings.tsx` (everyone else): five cards — Profile (split
  first/last name save via `PATCH /auth/me` `{first_name, last_name}`,
  frozen email readOnly), Password (3-field + live checklist, shared
  `PasswordChecklist` component), Gym profile & branch access (owner-gated
  gym name/tz + branch chips showing per-branch tz via `formatTimezone`),
  Role & permissions (role badge from `me.role_name` + read-only R/W/U/D
  `PermissionPills`), Danger zone (owner-gated). Selectors are a contract
  with `e2e/gym_ops_verify.cjs`.
- `PlatformSettings.tsx` (platform only): same Profile + Password cards
  (shared `PasswordChecklist`), split first/last name inputs, frozen email
  (readOnly/disabled in UI; backend enforces 403 `EMAIL_FROZEN` for ANY
  user submitting a different email). No role, permissions, gym-profile,
  or danger-zone sections (spec §UX).

## 4. Cross-cutting contracts

### 4.1 Password complexity — keep FE and BE in sync

Rule codes are `uppercase`, `lowercase`, `digit`, `special`, `length` (≥8),
in that order:

- Backend: `password_rule_failures()` in `backend/app/core/security.py` —
  enforced in `change_password` (service-level, AFTER current-password
  verification) → 422 `PASSWORD_TOO_WEAK` with `details.failed`.
- Frontend: `passwordChecks()` in `apps/web/src/lib/password.ts` (unit tests
  in `password.test.ts`). Any rule change must land in BOTH files + both test
  suites. Frontend is deliberately equal-or-stricter on unicode (JS `\d` is
  ASCII-only).

### 4.2 Test fixture hygiene (weak passwords are rejected)

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

## 5. Testing & gates

### 5.1 Gate selection

| Change | Required before merge |
| --- | --- |
| Backend behavior | `make test-backend` + `make lint` |
| Frontend logic/UI | `npx tsc --noEmit` + `make test-web` + the domain house script |
| Platform admin or shared files (§3.1) | `make e2e` + affected house scripts |
| Migration | `make migrate` + `make test-backend` |
| Every PR | CI: `Backend lint + tests`, `Frontend build` (`npm run build`) |

Every suite above must pass 100% — do not pin or "update" counts here; read
the command output.

### 5.2 Backend

- `make lint` → `ruff check app/ tests/ scripts/`.
- `make test-backend` → `pytest` (asyncio auto; session-scoped fixtures;
  plain output).
- Alembic: `make migrate` applies head; never hand-edit a shipped revision.

### 5.3 Frontend

- `cd apps/web && npx tsc --noEmit` (repo root has no TypeScript install).
- `make test-web` → `npm test` → `node --test "src/lib/*.test.ts"`.
- `npm run build` → `next build` (also a CI gate).

### 5.4 Platform Playwright suite

The super-admin gate is a proper `@playwright/test` suite under
`apps/web/e2e/platform/`:

- `auth.setup.ts` logs in once per run (storageState); spec files never
  re-login.
- One spec per module: `overview`, `gyms`, `owners`, `subscriptions`,
  `settings`, `impersonation`. `subscriptions.spec.ts` is serial (tier state
  is shared); everything else is parallel-safe.
- Helpers in `fixtures.ts`: `provisionGym`, `deleteGymIfExists`,
  `expectToast`, `dismissToasts`, `ts()`. Toasts live in a persistent
  `div[role="status"]` portal and do NOT auto-dismiss.
- Data hygiene: throwaway gyms/tiers use timestamped names and are cleaned up
  in `afterAll`; tests that rename the admin restore `Platform`/`Admin` in a
  `finally`; NEVER submit a real password change for the admin (checklist
  state only — the API path is pytest's job).
- No `webServer` block in `playwright.config.ts` on purpose — the suite runs
  against the already-running `make dev` / `make web` servers.
- **Workers rule: Playwright runs with `workers: 1` ONLY.** Config default
  is `workers: 1` and `make e2e` hardcodes `--workers=1`; never pass a higher
  `--workers` on the CLI. (Default `cpus/2` Chromiums freeze the machine via
  parallel Next dev compiles + bcrypt.) `trace: "off"`; `auth.setup.ts` warms
  every platform route first so the serial phase is compile-free. Debug a
  failure with `--trace on-first-retry`.
- Canonical entry points (repo root): `make e2e` (platform suite),
  `make e2e-ui` (UI mode), `make e2e-all` (platform + seven house scripts,
  sequential).

### 5.5 House e2e scripts

The seven house-style scripts (`gym_ops`, `plans`, `member_account`,
`role_visibility`, `frontdesk`, `expenses`, `billing`) are single-process and
run via `make e2e-<name>` (raw form: `NODE_PATH="$(npm root -g)" node
e2e/<name>_verify.cjs`) — always sequentially, never in parallel (shared dev
DB). Run the script for the domain you changed; use `make e2e-all` before a
promotion.

## Design Context

- `PRODUCT.md` — product register, platform (web), users, positioning, brand
  personality, anti-references, design principles, accessibility target
  (WCAG 2.1 AA).
- `DESIGN.md` — normative design tokens (colors, typography, radii, spacing,
  components) plus the six-section system spec and Do's/Don'ts.
- `.impeccable/design.json` — sidecar for `$impeccable live`/panel rendering
  (tonal ramps, shadows, motion, breakpoints, 8 self-contained component
  examples).

Read both files before any UI work. The platform admin panel remains frozen
per the rules above; design-token changes still require the `make e2e` gate.
