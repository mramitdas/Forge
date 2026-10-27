#!/usr/bin/env bash
# Reset ALL dev data to a pristine seeded state in one shot.
#
# Drops every table (all gyms, members, invoices, notifications, throwaway
# gate-provisioned gyms, walkthrough leftovers, …), re-runs every migration
# and re-seeds the demo data (platform admin, demo gym, staff, plans).
#
# Usage:  make reset     (from the repo root)   or   ./scripts/reset_dev.sh
#
# Running servers (:8000 / :3000) keep running, but existing logins point at
# the old gym ids — log out and back in after a reset.
set -euo pipefail
cd "$(dirname "$0")/.."   # -> backend/

echo "==> dropping every table owned by the app role"
PGPASSWORD=gym_dev_pass psql -h 127.0.0.1 -U gym -d gym_erp -v ON_ERROR_STOP=1 \
  -c "DROP OWNED BY CURRENT_USER;"

echo "==> rebuilding schema (alembic upgrade head)"
.venv/bin/alembic upgrade head

echo "==> re-seeding demo data"
.venv/bin/python -m scripts.seed_dev

echo "==> recreating the (empty) test database"
psql -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS gym_erp_test WITH (FORCE);" \
  -c "CREATE DATABASE gym_erp_test OWNER gym;"

echo
echo "Reset complete — fresh schema + seed:"
echo "  platform  admin@gym-erp.dev / admin-pass-123"
echo "  owner     demo-owner@gym-erp.dev / owner-pass-123"
echo
echo "Sessions created before the reset are invalid (gym ids changed):"
echo "log out and back in at http://localhost:3000."
