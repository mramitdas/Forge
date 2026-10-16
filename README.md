# Forge

A multi-tenant gym management ERP. Platform operators provision gyms, manage
their owners and subscription tiers, and track revenue; each gym owner gets a
fully scoped workspace for members, check-ins, plans, subscriptions, billing,
branches, and staff roles.

![CI](https://img.shields.io/github/actions/workflow/status/mramitdas/Forge/ci.yml?branch=main&label=CI)

## Features

**Gym workspace** (per-tenant, row-level security)

- Members, check-ins & attendance, membership plans, subscriptions, billing/invoices
- Branches with cross-branch access, staff roles & permissions, notifications
- Notifications with read/unread tracking

**Platform admin console** (`/platform`, frozen for v1)

- Provision / edit / suspend / delete gyms (timezone & currency, tier assignment)
- Gym owner lifecycle: password reset, enable/disable, impersonate ("Login")
- Subscription tiers as pricing cards with price + feature list, enable/disable
- Revenue dashboard with a 12-month sales chart and sold-subscriptions list

## Tech stack

| Layer     | Stack |
|-----------|-------|
| Backend   | FastAPI, SQLAlchemy 2 async, PostgreSQL with row-level security, transactional outbox event bus, Alembic |
| Frontend  | Next.js 15 (App Router), React, TanStack Query, Tailwind CSS |
| Auth      | JWT access + rotating refresh tokens, Argon2 password hashing |

## Repository layout

```
backend/            FastAPI app (app/), Alembic migrations, pytest suite
apps/web/           Next.js frontend
docs/               Architecture notes
Makefile            Dev helper targets (db, migrate, seed, test, lint, dev, web)
.github/workflows/  CI: backend lint+tests (Postgres service) and frontend build
```

## Quickstart

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

Open http://localhost:3000 and sign in as the platform admin
(`admin@gym-erp.dev` / `admin-pass-123`, seeded by `make seed`).

If port 3000 is already taken, Next.js falls back to the next free port (e.g.
3001). Point the e2e gates at it with `FORGE_BASE_URL`:

```bash
cd apps/web && FORGE_BASE_URL=http://localhost:3001 node e2e/platform_admin_verify.cjs
```

### Tests & lint

```bash
make test        # backend pytest suite
make lint        # ruff check
cd apps/web && npm run build   # typecheck + production build
```

The platform admin console is frozen for v1. See `AGENTS.md` for the frozen
surface and the regression gate (`apps/web/e2e/platform_admin_verify.cjs`).

## License

[MIT](LICENSE)
