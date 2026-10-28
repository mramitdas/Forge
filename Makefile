PY := .venv/bin/python
RUFF := .venv/bin/ruff
ALEMBIC := .venv/bin/alembic

.PHONY: db-up db-init db-psql migrate migrate-downgrade seed seed-fixtures reset test test-backend test-web lint fmt dev web help e2e e2e-ui e2e-gym e2e-plans e2e-member e2e-roles e2e-frontdesk e2e-expenses e2e-employees e2e-billing e2e-all

help:
	@echo "Targets:"
	@echo "  db-up        start the local postgres cluster (Debian or Homebrew)"
	@echo "  db-init      create the gym role and the gym_erp / gym_erp_test databases"
	@echo "  db-psql      open psql shell as gym role"
	@echo "  migrate      run alembic upgrade head on dev DB"
	@echo "  seed         seed dev DB (platform admin only, from env)"
	@echo "  seed-fixtures seed demo fixtures (demo gym, owner, plans, branch)"
	@echo "  reset        wipe ALL dev data, re-migrate, re-seed (single-shot cleanup)"
	@echo "  test         run backend (pytest -q) + web unit tests (npm test)"
	@echo "  test-backend run backend test suite (pytest -q)"
	@echo "  test-web     run frontend unit tests (node --test)"
	@echo "  lint         run ruff check on backend"
	@echo "  fmt          run ruff format + check --fix"
	@echo "  dev          run backend dev server on :8000"
	@echo "  web          run frontend dev server on :3000"
	@echo "  e2e          run platform Playwright suite (workers=1)"
	@echo "  e2e-ui       run platform suite in Playwright UI mode"
	@echo "  e2e-gym      run gym_ops house e2e script"
	@echo "  e2e-plans    run plans house e2e script"
	@echo "  e2e-member   run member_account house e2e script"
	@echo "  e2e-roles    run role_visibility house e2e script"
	@echo "  e2e-frontdesk run frontdesk house e2e script"
	@echo "  e2e-expenses run expenses house e2e script"
	@echo "  e2e-billing  run billing house e2e script"
	@echo "  e2e-employees run employee house e2e script"
	@echo "  e2e-all      platform suite + all house scripts, sequential"

# Starts a local Postgres cluster however this machine happens to manage it.
# Debian/Ubuntu ship pg_ctlcluster; macOS via Homebrew uses brew services.
db-up:
	@pg_ctlcluster 15 main start 2>/dev/null \
		|| brew services start postgresql@15 2>/dev/null \
		|| brew services start postgresql@14 2>/dev/null \
		|| brew services start postgresql 2>/dev/null \
		|| (echo "Could not auto-start Postgres. Start it manually, then run 'make db-init'."; exit 1)

# Creates everything the app expects to connect with. Runs as your local
# superuser (the `postgres` role, or your username on Homebrew installs).
# Each step is idempotent, so this is safe to re-run.
db-init:
	psql -d postgres -v ON_ERROR_STOP=1 \
		-c "CREATE ROLE gym WITH LOGIN PASSWORD 'gym_dev_pass' CREATEDB;" 2>/dev/null || true
	psql -d postgres -v ON_ERROR_STOP=1 \
		-c "CREATE DATABASE gym_erp OWNER gym;" 2>/dev/null || true
	psql -d postgres -v ON_ERROR_STOP=1 \
		-c "CREATE DATABASE gym_erp_test OWNER gym;" 2>/dev/null || true
	@echo "role 'gym' + databases 'gym_erp', 'gym_erp_test' ready"

db-psql:
	PGPASSWORD=gym_dev_pass psql -h 127.0.0.1 -U gym -d gym_erp

migrate:
	cd backend && $(ALEMBIC) upgrade head

migrate-downgrade:
	cd backend && $(ALEMBIC) downgrade base

seed:
	cd backend && $(PY) -m scripts.seed_dev

seed-fixtures:
	cd backend && $(PY) -m scripts.seed_fixtures

reset:
	cd backend && bash scripts/reset_dev.sh

test: test-backend test-web

test-backend:
	cd backend && $(PY) -m pytest -q

test-web:
	cd apps/web && npm test

lint:
	cd backend && $(RUFF) check app/ tests/ scripts/

fmt:
	cd backend && $(RUFF) format app/ tests/ scripts/ && $(RUFF) check --fix app/ tests/ scripts/

dev:
	cd backend && $(PY) -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

web:
	cd apps/web && npm run dev

# ── E2E ──
# RULE: Playwright only ever runs with 1 worker (`--workers=1` hardcoded here
# AND `workers: 1` in playwright.config.ts — never pass a higher --workers).
# Runs against the RUNNING dev servers (make dev + make web).
e2e:
	cd apps/web && npx playwright test e2e/platform --workers=1

e2e-ui:
	cd apps/web && npx playwright test e2e/platform --workers=1 --ui

# House-style scripts are single-process (inherently 1 worker) and share one
# dev DB — always run them sequentially, never in parallel.
e2e-gym: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/gym_ops_verify.cjs

e2e-plans: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/plans_verify.cjs

e2e-member: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/member_account_verify.cjs

e2e-roles: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/role_visibility_verify.cjs

e2e-frontdesk: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/frontdesk_verify.cjs

e2e-expenses: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/expenses_verify.cjs

e2e-employees: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/employee_verify.cjs

e2e-billing: seed-fixtures
	cd apps/web && NODE_PATH="$$(npm root -g)" node e2e/billing_verify.cjs

e2e-all: seed-fixtures e2e e2e-gym e2e-plans e2e-member e2e-roles e2e-frontdesk e2e-expenses e2e-billing e2e-employees
