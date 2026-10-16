PY := .venv/bin/python
RUFF := .venv/bin/ruff
ALEMBIC := .venv/bin/alembic

.PHONY: db-up db-init db-psql migrate migrate-downgrade seed test test-backend test-web lint fmt dev web help

help:
	@echo "Targets:"
	@echo "  db-up        start the local postgres cluster (Debian or Homebrew)"
	@echo "  db-init      create the gym role and the gym_erp / gym_erp_test databases"
	@echo "  db-psql      open psql shell as gym role"
	@echo "  migrate      run alembic upgrade head on dev DB"
	@echo "  seed         seed dev DB (platform user, demo gym, branch, plans)"
	@echo "  test         run backend (pytest -q) + web unit tests (npm test)"
	@echo "  test-backend run backend test suite (pytest -q)"
	@echo "  test-web     run frontend unit tests (node --test)"
	@echo "  lint         run ruff check on backend"
	@echo "  fmt          run ruff format + check --fix"
	@echo "  dev          run backend dev server on :8000"
	@echo "  web          run frontend dev server on :3000"

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
