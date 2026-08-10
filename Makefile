PY := .venv/bin/python
RUFF := .venv/bin/ruff
ALEMBIC := .venv/bin/alembic

.PHONY: db-up db-psql migrate migrate-downgrade seed test lint fmt dev web help

help:
	@echo "Targets:"
	@echo "  db-up        start postgres 15 cluster"
	@echo "  db-psql      open psql shell as gym role"
	@echo "  migrate      run alembic upgrade head on dev DB"
	@echo "  seed         seed dev DB (platform user, demo gym, plans)"
	@echo "  test         run backend test suite (pytest -q)"
	@echo "  lint         run ruff check on backend"
	@echo "  fmt          run ruff format + check --fix"
	@echo "  dev          run backend dev server on :8000"
	@echo "  web          run frontend dev server on :3000"

db-up:
	pg_ctlcluster 15 main start || true

db-psql:
	PGPASSWORD=gym_dev_pass psql -h 127.0.0.1 -U gym -d gym_erp

migrate:
	cd backend && $(ALEMBIC) upgrade head

migrate-downgrade:
	cd backend && $(ALEMBIC) downgrade base

seed:
	cd backend && $(PY) -m scripts.seed_dev

test:
	cd backend && $(PY) -m pytest -q

lint:
	cd backend && $(RUFF) check app/ tests/

fmt:
	cd backend && $(RUFF) format app/ tests/ && $(RUFF) check --fix app/ tests/

dev:
	cd backend && $(PY) -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

web:
	cd apps/web && npm run dev
