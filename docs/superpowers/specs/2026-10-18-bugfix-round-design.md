# Bug-Fix Round Design (2026-10-18)

Fixes the 11 bugs + a11y + pagination found in the Phase-12 Chrome DevTools QA of the
UI-residue round, then re-verifies the entire application end-to-end per role.

## Scope (user-approved)

**In:** the 11 ranked bugs; a11y (input labels, icon-button `aria-label`, toast
`role="status"`); `must_change_password` full-stack gate; expenses server pagination +
Revenue-table client-side pagination.

**Out (deferred):** tier-limit enforcement (Evolve 560 vs Starter 250), E2E-data residue
cleanup script, notifications list pagination (mark-all fixes the stuck badge; list stays
capped at 50 with a "showing 50 of N" hint).

**Approved exceptions:** Bug 9 touches frozen-surface shared pollers (`lib/hooks.ts`) —
user approved; the gate must stay 22/22 and non-platform behavior unchanged.

## Bug → fix map

Numbering matches the final QA report (Bugs 1–11).

| # | Bug | Fix | Layer |
|---|-----|-----|-------|
| 1 | Revenue week chart bars 0px | Bar heights become px: `max(2, round(v/max·144))` inside fixed `h-40` container (`(app)/page.tsx` RevenueCard) | FE |
| 2 | Member search broken on multi-word | `ILIKE` against `first_name \|\| ' ' \|\| last_name` concat + per-field + email fallbacks (`members/service.py:209-218`) | BE |
| 3 | Double-submit creates duplicates | Extract shared in-flight helper (Task-3 pattern); apply to member create, check-in, plans, expenses, payment forms | FE |
| 4 | Outstanding counts void invoices | `billing/page.tsx:66-68`: Outstanding = `open`+`partial` only (excludes void/draft) | FE |
| 5 | Notifications stuck unread badge | New `POST /api/v1/notifications/mark-all` marks ALL unread in DB; frontend button calls it, keeps double-click guard, invalidates list+count. Composite: list stays capped at 50 with a "showing 50 of N" hint | BE+FE |
| 6 | Error/denied toasts styled as success | Explicit `outcome` param on toast helper; denied/error → `bg-destructive` (`plans/page.tsx:68-72`, `members/[id]/page.tsx:274-276`) | FE |
| 7 | Check-in denial hardcodes reason, no outcome colors | Use API-supplied reason in toast; granted/denied/duplicate get distinct colors (`checkins/page.tsx`, `(app)/page.tsx`) | FE |
| 8 | Void invoices show "Pay now" | Pay action only for `open`/`partial` | FE |
| 9 | Platform-role always-fire 403s | `useNotificationsData`/unread-count pollers skip without `notifications.view`; settings page fetch guarded by its permission (`lib/hooks.ts`) | FE |
| 10 | Past-due `partial` never Overdue | `adapters.ts:233`: overdue = (`open` or `partial`) && dueDate < today | FE |
| 11 | `must_change_password` ignored | Full-stack gate — see below | BE+FE |
| + | a11y: unlabeled inputs, title-only icon buttons, silent toast | `id`+`name`+label on inputs; `aria-label` on icon-only buttons; Toast root `role="status" aria-live="polite"` | FE |
| + | Expenses unpaged; Revenue table unpaged | Expenses: server `limit/offset` (members pattern) + pager; Revenue subscriptions table: client-side pagination only (platform API is frozen) | BE+FE / FE |

## must_change full-stack design (Bug 11)

Ground truth: flag lives on `Credential.must_change` (`identity/models.py:84`); JWT
claims built in `_issue_for_user` (`identity/service.py:63-67`) currently carry only
`is_platform`; **no password-change endpoint exists** (`/auth/me` PATCH = name/email
only).

1. **Token claim:** `_issue_for_user` adds `must_change` claim (passed by callers;
   `authenticate` has the credential loaded; `refresh_tokens` loads it too).
2. **TokenResponse:** new field `must_change: bool` (non-frozen auth schema) so the
   frontend learns the flag at login — `/me` cannot be the source (it will be blocked).
   `MeOut`/`UserOut` also expose it for post-change state.
3. **New endpoint `POST /auth/change-password`:** body `{current_password,
   new_password}`; verifies current, rehashes, clears `credential.must_change`,
   revokes the user's refresh-token family, issues fresh tokens (response
   `TokenResponse` with `must_change=False`). Allowlisted in the gate.
4. **Enforcement dependency:** `reject_if_must_change` reads the claim from the
   resolved actor; if true → `403 {code: "must_change_password"}`. Applied to the
   app's authenticated router with an explicit allowlist: `POST /auth/login`,
   `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`,
   `GET /health*`. Platform admins never have the flag set.
5. **Frontend:** login stores `must_change`; `AuthProvider` + route gate redirect to a
   forced `/change-password` screen (no sidebar); global React Query error handler
   catches `code === "must_change_password"` and redirects there too; success swaps
   tokens, refreshes me, routes to `/`.
6. **QA data note:** verify with `evolve-import-2026` by changing the password to the
   SAME value (`evolve-import-2026`) — clears the flag, keeps the known credential.

## Notifications mark-all (Bug 5)

- Service: update all `InAppNotification(user_id=…, read_at IS NULL)` → now; return
  affected count. API: `POST /notifications/mark-all` (perm `notifications.view`).
- Frontend: existing mark-all button switches from "loop visible ids" to the single
  call + invalidate `["notifications"]` + `["notifications","unread-count"]`;
  retains the Task-3 in-flight guard. Empty-state/caught-up unchanged.

## Search (Bug 2)

`list_members` search clause becomes
`or_(concat(first_name," ",last_name).ilike(q), first_name.ilike(q),
last_name.ilike(q), email.ilike(q))` with `q = f"%{query}%"`. Tests: member
"DblClick QA" findable by `"DblClick QA"`, `"DblClick"`, `"QA"`; single-name members
still match.

## Double-submit helper (Bug 3)

`useInFlight()` → `[pending, run(fn)]`, ignores re-entry while pending (same contract
as the Task-3 notifications guard). Applied to: Add member, Add plan, Add expense,
check-in submit, invoice Pay now modal confirm.

## Error handling & invariants

- Platform admin panel stays byte-identical except poller-skip for platform role
  (approved). Gate 22/22 after every shared-file task.
- All new backend endpoints follow existing perm/Actor patterns; no schema migrations
  needed except none (flag column exists; claims are JWT-side).
- Toasts: single helper with explicit `outcome: "success" | "error" | "denied" |
  "info"`; no string-shape heuristics remain.

## Testing

- **Backend (pytest):** multi-word search; mark-all (2 users' isolation + count);
  must_change: flagged token 403 on protected route, allowlist passes, change-password
  clears flag + old refresh revoked; change-password wrong-current → 400.
- **Frontend:** `tsc`, unit tests for the widened overdue derivation (open/partial ×
  past/future), gate, e2e battery (update scripts only where behavior changed, e.g.
  void pay-now hidden).
- **Final phase — per-role Chrome DevTools QA (user requirement):** fresh isolated
  contexts; sign in as all 6 roles (platform, owner, evolve-import, manager,
  receptionist, trainer); written checklist: every module × every function; re-verify
  all 11 bugs fixed; re-verify previously-green list (XSS, theme, gating, scale,
  validation, 404 states); console clean on key pages; light+dark spot-check; QA
  mutations cleaned up; theme left dark; final full battery re-run.

## Execution shape

~10 TDD tasks (backend group → frontend groups → a11y/pagination → battery → per-role
QA), spec review each, direct commits to `main`.
