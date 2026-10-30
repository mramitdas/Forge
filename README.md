# Forge

A multi-tenant gym management ERP. Platform operators provision gyms, manage
their owners and subscription tiers, and track revenue; each gym owner gets a
fully scoped workspace for members, check-ins, plans, subscriptions, billing,
branches, and staff roles.

![CI](https://img.shields.io/github/actions/workflow/status/mramitdas/Forge/ci.yml?branch=dev&label=CI)

## Features

**Gym workspace** (per-tenant, row-level security)

- Members, check-ins & attendance, membership plans, subscriptions, billing/invoices
- Branches with cross-branch access, staff roles & permissions, notifications
- Notifications with read/unread tracking
- Paginated tables with a per-page size selector (50 / 100 / 500 / 1000)

**Platform admin console** (`/platform`, frozen for v1)

- Provision / edit / suspend / delete gyms (timezone & currency, tier assignment)
- Gym owner lifecycle: password reset, enable/disable, impersonate ("Login")
- Subscription tiers as pricing cards with price + feature list, enable/disable
- Revenue dashboard with a 12-month sales chart and sold-subscriptions list

## Tech stack

| Layer      | Stack |
|------------|-------|
| Backend    | FastAPI, SQLAlchemy 2 async, PostgreSQL with row-level security, transactional outbox event bus, Alembic, Mangum (serverless ASGI adapter) |
| Frontend   | Next.js 15 (App Router), React 19, TanStack Query, Tailwind CSS 4 |
| Auth       | JWT access + rotating refresh tokens, Argon2 password hashing |
| Deployment | Vercel (Next.js frontend + FastAPI serverless function), Supabase Postgres |

## Repository layout

```
backend/            FastAPI app (app/), Alembic migrations, pytest suite
  api/index.py      Serverless ASGI entrypoint (Mangum handler) for Vercel
  vercel.json       Vercel Python function build + catch-all route
apps/web/           Next.js frontend
  vercel.json       Vercel Next.js project config
docs/               Architecture notes and design/plan docs
Makefile            Dev helper targets (db, migrate, seed, test, lint, dev, web, e2e)
.github/workflows/  CI: backend lint+tests (Postgres service) and frontend build
```

## Quickstart (local)

Prerequisites: Python 3.11+, Node 22+, and a local PostgreSQL cluster (14 or 15).

```bash
# 1. Start Postgres, then create the role + databases the app connects with.
#    db-up works on Debian (pg_ctlcluster) and macOS (Homebrew); db-init is
#    idempotent and safe to re-run.
make db-up
make db-init
make migrate
make seed

# 2. Backend on :8000 (FastAPI with --reload)
make dev

# 3. Frontend on :3000 (Next.js dev server, proxies /api and /health to :8000)
make web
```

Open http://localhost:3000 and sign in as the platform admin configured by
`GYM_PLATFORM_ADMIN_EMAIL` / `GYM_PLATFORM_ADMIN_PASSWORD` in `backend/.env`
(seeded by `make seed`; `make reset` wipes, re-migrates, and re-seeds).

If port 3000 is already taken, Next.js falls back to the next free port (e.g.
3001). Point the e2e gates at it with `FORGE_BASE_URL`:

```bash
cd apps/web && FORGE_BASE_URL=http://localhost:3001 npx playwright test e2e/platform --workers=1
```

## Configuration

Environment files are git-ignored; only `*.env.example` files are tracked.

| File | Purpose |
|------|---------|
| `backend/.env.example` | Documents every backend variable (`GYM_` prefix). Copy to `backend/.env`. |
| `backend/.env` | Local/dev settings (Postgres on `127.0.0.1`, dev JWT secret, admin credentials). |
| `backend/.env.production` | Production settings loaded after `.env` (Supabase URL, prod JWT secret, CORS). Never committed. |
| `apps/web/.env.example` | Frontend env; copy to `apps/web/.env.local`. Set `API_BACKEND_URL` when the API is not on `:8000`. |

The backend reads `backend/.env` then `backend/.env.production` (later file
wins), so `make migrate`, `make seed`, and the dev server all target whichever
database those files point at. The frontend proxies `/api/*` and `/health/*`
to `API_BACKEND_URL` (default `http://localhost:8000`) via Next rewrites.

## Deployment (Vercel + Supabase)

The backend runs as a single Vercel Python serverless function; the frontend is
a standard Next.js Vercel project. Both are deployed independently.

1. **Database** — create a Supabase project and use its Postgres connection
   string in `backend/.env.production` as `GYM_DATABASE_URL` (append
   `?ssl=require`). The migrations expect a `gym` role to exist; create it once:
   ```bash
   psql "$SUPABASE_URL" -c "CREATE ROLE gym NOINHERIT LOGIN PASSWORD '<pw>';"
   GYM_DATABASE_URL="...:5432/..." .venv/bin/alembic upgrade head
   GYM_DATABASE_URL="...:5432/..." .venv/bin/python -m scripts.seed_dev
   ```
   Use Supabase's **session mode** pooler (port `5432`) — transaction mode
   (`6543`) does not support prepared statements and will fail at runtime.

2. **Backend project** — deploy from `backend/` (`vercel deploy --prod`). The
   `api/index.py` Mangum handler serves the FastAPI app; `vercel.json` builds it
   with `@vercel/python` and routes every path to it. Set env vars in the Vercel
   project (at minimum `GYM_DATABASE_URL`, `GYM_ENVIRONMENT=production`,
   `GYM_JWT_HMAC_SECRET`, `GYM_PLATFORM_ADMIN_*`, `GYM_ALLOWED_ORIGINS`).

3. **Frontend project** — deploy from `apps/web/` (`vercel deploy --prod`). Set
   `API_BACKEND_URL` to the backend project URL so the `/api` and `/health`
   rewrites target it.

Health probes: `GET /health/live` (process up) and `GET /health/ready`
(database reachable). The first request after a cold start may briefly report
`/health/ready` as `503` while the pooler connection warms up.

## Tests & lint

```bash
make test          # backend pytest suite + web unit tests
make test-backend  # pytest -q
make test-web      # node --test "src/lib/*.test.ts"
make lint          # ruff check app/ tests/ scripts/
make fmt           # ruff format + check --fix
cd apps/web && npx tsc --noEmit   # frontend typecheck
cd apps/web && npm run build      # production build (also a CI gate)
```

## End-to-end tests

Playwright runs against already-running dev servers (`make dev` + `make web`)
and **always uses a single worker** (shared dev DB; parallel Next compiles +
bcrypt can freeze the machine). Never pass `--workers > 1`.

```bash
make e2e            # platform admin @playwright/test suite (apps/web/e2e/platform)
make e2e-ui         # same suite in Playwright UI mode
make e2e-gym        # house-style scripts, one domain each (sequential):
make e2e-plans      #   e2e-plans, e2e-member, e2e-roles, e2e-frontdesk,
make e2e-member     #   e2e-expenses, e2e-employees, e2e-billing
make e2e-all        # platform suite + every house script, sequential
```

House scripts run a `seed-fixtures` step first. The platform suite is a proper
`@playwright/test` project with a stored auth state (`auth.setup.ts`) and one
spec per module.

## Branching & CI

- `prod` ← `stag` ← `dev` ← feature branches (`<type>/<issue#>-<slug>`); all
  promotion is PR-only, one hop at a time.
- Required checks: `Backend lint + tests` and `Frontend build` (`.github/workflows/ci.yml`).
- The platform admin console is frozen for v1. See `AGENTS.md` for the frozen
  surface, guardrails, and the full gate matrix.

## License

[MIT](LICENSE)
