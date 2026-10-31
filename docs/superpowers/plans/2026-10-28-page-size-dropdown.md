# Page-size dropdown (50/100/500/1000) across all list pages

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Every list page gets server-side pagination with a rows-per-page dropdown (default 50; options 50/100/500/1000), persisted per page in localStorage.

**Architecture:** Backend — raise existing caps to 1000 (members/billing/attendance) and add page/page_size params to the 4 unpaginated list endpoints (subscriptions, employees, expenses-by-year, notifications). Frontend — one shared `PageSizeSelect` component + `usePageSize` localStorage hook wired into each page. Small config lists (plans, branches, roles) stay full lists — they feed form dropdowns and never exceed a handful of rows.

**Tech Stack:** FastAPI + OffsetPagination, Next 15 client components, TanStack Query, Playwright e2e.

**Spec:** none (feature plan); argues from code paths + AGENTS.md.

## Global Constraints
- Conventional commits ≤50 chars, `refs #N`; branch → PR → `dev`.
- Plans/branches/roles lists intentionally NOT paginated (form-option data); note in PR.
- Default 50 everywhere; options exactly `50, 100, 500, 1000`; cap `le=1000` in every endpoint.
- localStorage key `forge.page-size.<page>`; invalid/stale values fall back to 50.
- AGENTS gates: `make lint`, `make test-backend`, `npx tsc --noEmit`, `make test-web`, `npm run build`, `make e2e`, affected house scripts.

## Review Focus
- Switching page size resets to page 1 (no out-of-range page).
- localStorage fallback: corrupted/absent value → 50, never crashes.
- Subscriptions (1,963 rows today): default 50 → total/pages math correct; filters + pagination compose.
- Billing e2e: pagination assertions recompute under page size 50 (25 created rows → 1 page — script creates 60+ rows to keep page-2 coverage).
- Members e2e (25 created rows, previously 3 pages at 10/page): same rework.

---

### Task 1: Backend pagination params + caps
**Files:** Modify `backend/app/modules/members/api.py` (le 100→1000), `billing/api.py` (le 200→1000), `attendance/api.py` (le 100→1000, default 20→50), `membership/api.py` (subscriptions GET → page/page_size, PageOut shape), `identity/api.py` (`list_employees` → page/page_size), `expenses/api.py` (year list → page/page_size), `notifications/api.py` (list → page/page_size). Ship the FE hook changes for reshaped responses in Task 3 instead if cleaner — implementer decides, notes it in report.
- [ ] Pytest first: default 50, le=1000, page math.
- [ ] Gates: `make lint`, `make test-backend`.
- [ ] Commit `feat(api): page-size params on list endpoints`.

### Task 2: Shared dropdown + 3 already-paginated pages
**Files:** Create `apps/web/src/components/page-size-select.tsx` + `apps/web/src/lib/use-page-size.ts`; Modify `src/lib/hooks.ts` (members/invoices/checkins hooks take dynamic pageSize), `members/page.tsx`, `billing/page.tsx`, `checkins/page.tsx` (checkins gains pager UI).
- [ ] Reset to page 1 on size change.
- [ ] Gates: tsc, `make test-web`, `npm run build`, affected e2e.
- [ ] Commit `feat(web): page-size dropdown on paginated tables`.

### Task 3: Wire remaining pages
**Files:** Modify `src/lib/hooks.ts` (subscriptions/employees/expenses/notifications → paged variants), `subscriptions/page.tsx`, `employees/page.tsx`, `expenses/page.tsx`, `notifications/page.tsx`.
- [ ] Gates: tsc, test-web, build.
- [ ] Commit `feat(web): paginate remaining list pages`.

### Task 4: e2e rework + full battery + PR
**Files:** Modify `apps/web/e2e/billing_verify.cjs`, `member_account_verify.cjs`, `gym_ops_verify.cjs`, `frontdesk_verify.cjs`, `employee_verify.cjs` (recount pages under 50; exercise the dropdown in billing + member scripts; create 60+ rows where page-2 coverage is asserted), `role_visibility_verify.cjs` (only if it asserts member-list pagination).
- [ ] Full battery sequential + `make e2e`.
- [ ] PR → `dev` → CI → merge; close issue.
