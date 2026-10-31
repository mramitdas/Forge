# Seed-data rework: env-driven admin, fixtures split, GMS SQLite import

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Platform admin seeded only from `.env` (fail-fast), zero other seed data in `make seed`/`make reset`; demo fixtures moved to `make seed-fixtures` for e2e; `import_gms.py` fixed for the two-tier catalog and run against the real GMS SQLite file.

**Architecture:** Three workstreams sharing `seed_dev.py`/`reset_dev.sh`/Makefile — (1) Settings-driven admin creds; (2) split seed vs fixtures; (3) importer role-mapping fix — then a real-data import + verification pass.

**Tech Stack:** FastAPI + SQLAlchemy async, pydantic-settings, bash/Makefile, sqlite3 importer.

**Spec:** none (infra/cleanup plan); argues from code paths + AGENTS.md.

## Global Constraints
- Never commit `.env` or secrets; add keys to `.env.example` only.
- Conventional commits ≤50 chars, `refs #N` (issue #19).
- Branch `feat/19-seed-gms-import` → PR → `dev`.
- `make reset` = wipe + migrate + admin-only seed.
- All 8 house e2e scripts + platform suite stay green.
- No schema change → no migration.
- GMS SQLite source (user-provided): /Users/amit/Documents/gms/src/backend/db.sqlite3; import slug: evolve-gym.

## Review Focus
- Seed idempotency: re-running seed/seed-fixtures never duplicates.
- Fail-fast clarity: missing env vars → actionable message naming the vars.
- Importer idempotency: re-running against the same SQLite skips existing rows.
- Staff-role creation respects the 0022 two-tier catalog (no retired template names).
- CI not broken: auth.setup.ts env-read fails only locally when unset (CI doesn't run e2e).

---

### Task 1: Env-driven platform admin
**Files:** Modify `backend/app/core/config.py` (Settings fields `platform_admin_email`/`platform_admin_password` ← `GYM_PLATFORM_ADMIN_EMAIL`/`GYM_PLATFORM_ADMIN_PASSWORD`), `backend/scripts/seed_dev.py` (lines 28–29, 83–98 read from settings; fail-fast; validate ≥8+complexity via `password_rule_failures`), `backend/scripts/reset_dev.sh:32` (banner), `apps/web/e2e/platform/auth.setup.ts:3` (process.env, fail fast), `.env.example` (add keys; create if missing).
- [ ] Implement + gates (`make test-backend`, `make lint`, `npx tsc --noEmit`, `make e2e`).
- [ ] Commit `feat(seed): admin creds from environment`.

### Task 2: Split `seed` vs `seed-fixtures`
**Files:** Modify `backend/scripts/seed_dev.py` (strip demo gym/plans/branch/role-flag-sync → admin only), Create `backend/scripts/seed_fixtures.py` (demo gym + owner + plans + MAIN branch + role-flag sync moved verbatim), `backend/scripts/reset_dev.sh`, `Makefile` (`seed-fixtures` target; e2e targets + `e2e-all` run it first), banner text.
- [ ] `make reset && make seed` → only platform admin (SQL-verified).
- [ ] `make e2e-gym` proves fixtures; full battery sequential.
- [ ] Commit `feat(seed): split dev fixtures out of seed`.

### Task 3: Fix importer for two-tier catalog
**Files:** Modify `backend/scripts/import_gms.py` (STAFF_ROLE_MAP → two-tier: sub-owner → "Sub Owner" with manage codes for members/membership/billing/expenses/attendance + tenancy.manage; staff → "Staff" with view codes for members/membership/billing/attendance/expenses; create missing roles inline via create_role instead of skipping).
- [ ] `make lint`, `make test-backend` green; importer provisioning works on demo-free DB.
- [ ] Commit `fix(import): two-tier staff role mapping`.

### Task 4: Real import + verification + sweep
**Files:** none (operations).
- [ ] Run `python -m scripts.import_gms /Users/amit/Documents/gms/src/backend/db.sqlite3 --slug evolve-gym`.
- [ ] SQL verification: per-table counts, zero skipped staff, must_change=True, Gym Owner intact.
- [ ] Full gate battery + `make e2e-all`; PR → `dev` → CI → merge; close issue.
