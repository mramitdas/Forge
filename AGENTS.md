# AGENTS.md

## 1. On session start

Every session begins the same way:

1. Read this file (`AGENTS.md`).
2. Check open issues and PRs for context (`gh issue list`, `gh pr list`). Build context from issue/PR comments, not memory.
3. Verify local git state: confirm you're on the correct branch and the working tree is clean (`git status`, `git branch`).
4. Confirm the target branch is `dev`.
5. Confirm dev servers are up (`make dev` and `make web`) before any UI or e2e work.

## 2. Repository map

- `apps/web` — Next.js 15 app-router frontend (client components, TanStack Query)
- `apps/mobile` — Expo SDK 58 React Native app (Expo Router, TanStack Query); Phase 1 is UI-only, backed by fixtures in `src/fixtures/`
- `backend` — FastAPI + SQLAlchemy async; Alembic revisions in `backend/alembic/versions/`
- `apps/web/e2e` — house-style `.cjs` Playwright scripts
  - `apps/web/e2e/platform` — `@playwright/test` suite
- `docs/superpowers/{specs,plans}` — design specs and implementation plans

## 3. Dev servers

Run both before any UI or e2e work:

- **Backend:** `make dev` → uvicorn `:8000` with `--reload`
  Health probe: `GET /api/v1/auth/me` should return 401.
  With admin fixture: `POST /api/v1/auth/login` should return 200.
  If you get a 500 with `UndefinedColumnError`, the DB was downgraded — run `backend/.venv/bin/alembic upgrade head`.
- **Frontend:** `make web` → Next.js dev server on `:3000`

## 4. Git & GitHub

### Branching

All branches use the pattern:

```
<type>/<issue#>-<slug>
```

Types: `feat`, `fix`, `chore`, `docs`, `test`. Example: `feat/12-rate-limiting`.

### Committing

- Use conventional commit format: `feat:`, `fix:`, `chore:`, `docs:`, `test:`.
- Subject line: 50 characters or less.
- Commit body (when needed): explain the why. End with `refs #N`.
- One task = one commit. No combining unrelated changes.

### Pull requests

- All feature/issue PRs target `dev`.
- Solo maintainer: 0 required approvals. Merge gate is green CI checks + passing PR.
- CI checks: `Backend lint + tests`, `Frontend build` (both must be green).
- No secrets or `.env` in the diff. `.env` is git-ignored.
- Issues: GitHub auto-close (`Closes #N`, ` Fixes #N`, …) only fires when a PR merges into the **default branch** (`prod`). PRs into `dev` use `refs #N` only, and the agent closes the issue explicitly right after its PR merges to `dev`, with a one-line ship summary.

### PR checklist (all required before merge)

1. `make test-backend` — all tests pass
2. `make lint` — ruff clean
3. `npm run build --workspace=apps/web` — Next.js build clean (includes type-checking)
4. `make test-web` — all tests pass
5. No secrets or `.env` in the diff
6. Acceptance criteria demonstrably met
7. PR targets the correct branch in the chain

## 5. Branches & promotion

### Branch layout

```
prod ← stag ← dev ← feat/issue branches
```

- `prod` — default/protected. Can only be merged from `stag`.
- `stag` — staging. Can only be merged from `dev`.
- `dev` — integration branch. Can only be merged from feature/issue branches.
- Feature/issue branches target `dev`.

### Promotion rules

- Promotion is **sequential and PR-only**. One hop at a time.
- `dev` → `stag`: PR from `dev` into `stag`.
- `stag` → `prod`: PR from `stag` into `prod`.
- Never skip a hop. Never merge `dev` directly into `prod`.
- **Human-only hops.** The maintainer alone raises and merges promotion PRs (`dev` → `stag`, `stag` → `prod`). Agents do not create, push, or merge promotion branches/PRs, and run no post-promotion environment changes unless asked. Agent scope ends at a feature/issue PR merged into `dev`; after that, the agent reports the ship-ready state and hands over.

### Branch deletion

- Merging a PR with `gh pr merge --delete-branch` deletes the head branch. Use this for **feature/issue branches only**.
- Never head-delete `dev`, `stag`, or `prod`. Promotion PRs must merge without `--delete-branch`.
- Feature-branch cleanup is managed automatically via the PR delete flag; manual cleanup is only used if the flag fails.

### Push rules

- Never push commits directly to the protected tracking branches (`prod`, `stag`, or `dev`) on `origin`.
- Feature and issue branches must be pushed to their own remote origin branches to open a Pull Request.
- Force-pushes are strictly forbidden on `prod`, `stag`, or `dev`.
- No `--no-verify`.
- All changes must land through PRs targeting their respective downstream environment branch.

## 6. Guardrails

### Anti-hallucination

- **Cite, never guess.** Every file, function, command, or config an agent references must exist in the repo right now — verify by reading before acting.
- **No invented APIs.** Never use a library method from memory; read the installed package for the pinned version in use.
- **Read before edit.** A file must be fully read before it is edited.
- **Verify before claiming.** Never say "done", "passing", or "fixed" without having run the actual command.
- **Acknowledge unknowns.** Unsure about an env value or secret? Stop and ask.
- **Diff-check after edits.** After every edit, review `git diff` to confirm only intended changes.

### Scope discipline

- One issue = one PR = one logical change. Implement only what the accepted issue defines.
- No drive-by refactors or "while I'm in here" changes. Spotted problems → new issue, don't fix inline.
- No unrequested suggestions at the end of a task.

### Security

- Never commit secrets, tokens, API keys, or `.env`. Real secrets live in local `.env` / deployment secret store.
- Dependencies are added/changed only through requirement manifests (`backend/pyproject.toml`; frontend `apps/web/package.json` + `package-lock.json`).
- Never disable lint, typecheck, or test gates to make something pass.

### Destructive operations

The following require explicit, current-session user approval before running: `git push --force` (only permitted on feature branches), branch deletion of integration branches (`dev`, `stag`, `prod`), dropping/updating DB migrations, deleting files beyond scope, publishing or releasing, anything modifying `prod` history.

## 7. Dev workflow

- One task = ≤ 30 minutes of work = one commit = one checkbox in its issue.
- Tasks exceeding 30 minutes are split into subtasks within the issue.
- Every task has executable acceptance criteria (a test, a command, or a demonstrable behavior). Done = AC passes.
- Feature issues are parents with a task checklist; each item is its own branch/PR.
- Status is communicated through issue/PR comments, not memory.

## 8. Testing & gates

Every suite must pass 100% — do not pin or "update" counts; read the command output.

| Change | Required before merge |
| --- | --- |
| Backend behavior | `make test-backend` + `make lint` |
| Frontend logic/UI | `npm run build --workspace=apps/web` + `make test-web` + the domain e2e script |
| Mobile | `npm run typecheck` + `npm test` in `apps/mobile` |
| Migration | `make migrate` + `make test-backend` |
| Every PR | CI: `Backend lint + tests`, `Frontend build` (`npm run build --workspace=apps/web`) |

### Backend

- `make lint` → `ruff check app/ tests/ scripts/`.
- `make test-backend` → `pytest` (asyncio auto; session-scoped fixtures).
- Alembic: `make migrate` applies head; never hand-edit a shipped revision.

### Frontend

- `npx --prefix apps/web tsc --noEmit` — type-checks the frontend.
- `make test-web` → `npm test --workspace=apps/web` → runs unit suites matching `src/lib/*.test.ts`.
- `npm run build --workspace=apps/web` → builds Next.js application layer (run from root workspace context).

### E2E

- `make e2e` — runs platform Playwright suite (`npx playwright test e2e/platform --workers=1`).
- Seven house-style runner scripts (`gym_ops`, `plans`, `member_account`, `role_visibility`, `frontdesk`, `expenses`, `billing`) run natively via node or specific targets: `make e2e-<name>`. Sequential, never parallel (shared dev DB).
- Ensure all custom test suites are configured to execute in **serial mode** internally to prevent race condition blocks against the local DB state.
- Run the script for the domain you changed; use `make e2e-all` before a promotion.

## 9. Design context

Read these files before any UI work:

- `PRODUCT.md` — product register, platform (web), users, positioning, brand personality, anti-references, design principles, accessibility target (WCAG 2.1 AA)
- `DESIGN.md` — normative design tokens (colors, typography, radii, spacing, components) plus six-section system spec and Do's/Don'ts
- `.impeccable/design.json` — sidecar for `$impeccable live`/panel rendering (tonal ramps, shadows, motion, breakpoints, component examples)

The platform admin panel remains frozen per §6 scope discipline; design-token changes still require the `make e2e` gate.
