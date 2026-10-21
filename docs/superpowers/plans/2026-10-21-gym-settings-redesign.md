# Gym-Side Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `GymSettings.tsx` per `docs/superpowers/specs/2026-10-21-gym-settings-redesign-design.md`: Profile card (split first/last name, frozen email, save via `PATCH /auth/me`), new Password card (platform-identical 3-field + live checklist), merge gym profile + branch access into one card with per-branch timezone chips, merge role + granted-permissions into one read-only card with fixed R/W/U/D pill toggles, email freeze for ALL users (BE 403 `EMAIL_FROZEN`), `/auth/me` gains `role_name` + `branches[].timezone`, repo-wide Select chevron, shared `PasswordChecklist` extraction (PlatformSettings behavior byte-identical).

**Architecture:** Additive `/auth/me` response fields (no migration), one BE guard condition drop (`actor.is_platform and`), one shared component extraction (`PasswordChecklist`), one shared `Select` class change, `formatTimezone` helper + unit test, full `GymSettings.tsx` rewrite, and a same-commit `gym_ops_verify.cjs` settings-block retarget. No DB writes change behavior; Branch.timezone column already exists.

**Tech Stack:** Next.js 15 / React Query / FastAPI / SQLAlchemy / pytest+httpx / node:test / Playwright.

**Ground rules:**
- Dev servers RUNNING on :3000/:8000 — do not restart (if dead: `make dev` / `make web` from repo root).
- **Gates after EVERY task:** from `backend/`: `.venv/bin/python -m pytest -q` (baseline **105 passed**), `.venv/bin/ruff check app tests scripts alembic` (clean); from `apps/web`: `npx tsc --noEmit` (clean), `npm test` (baseline **17 pass**; glob `src/lib/*.test.ts`, runner `node --test`).
- **Shared-file rule:** after ANY change to `ui.tsx`, `hooks.ts`, `types.ts`, `auth.ts`, `(app)/layout.tsx`, or settings pages: run `cd apps/web && npx playwright test e2e/platform` — must be **59 pass / 1 skip (100%)**. The platform Playwright suite is the frozen-surface gate (AGENTS.md Rule 3).
- **CPU budget:** workers=2, trace off; debug failures with `--trace on-first-retry`. Never raise workers.
- **E2E scripts self-provision and share one dev DB — run SEQUENTIALLY.** `gym_ops` baseline **33/33**; after this round still **33/33** (settings block L205–293 retargeted in the same commit as the UI change it covers).
- Never `git add -A`; stage only task files. Commit directly to `main` after each task.
- Fixtures: admin `admin@gym-erp.dev`/`admin-pass-123` (full_name "Platform Admin" — e2e must not rename it); owner `demo-owner@gym-erp.dev`/`owner-pass-123`; other gym roles `branch-manager`/`receptionist`/`trainer@gym-erp.dev`. Never submit a real password change in e2e (fixtures must survive for other suites) — password paths are pytest-covered.
- JSON error contract: errors serialize as `{"detail": {"error": {code, message, details}}}`; FE `ApiError.detail` = `body.error ?? body.detail ?? body`.
- Toasts: persistent `div[role="status"]` portal, no auto-dismiss — after restore flows assert via sidebar text, NOT a second toast wait.

**Fix → task map (spec sections):**

| Spec item | Task |
|-----------|------|
| BE: `role_name` + `branches[].timezone` in `/auth/me` + pytest | Task 1 |
| BE: email freeze for all users + rewrite 3 existing owner-email tests | Task 2 |
| FE: `formatTimezone` + unit test | Task 3 |
| FE: shared `PasswordChecklist` extraction (PlatformSettings byte-identical) | Task 4 (GATE platform) |
| FE: repo-wide Select chevron | Task 5 (GATE platform) |
| FE: `GymSettings.tsx` rewrite (Profile/Password/Gym+Branch/Role pills) + types/hooks | Task 6 |
| FE+e2e: `gym_ops_verify.cjs` L205–293 retarget | Task 7 (GATE 33/33) |
| AGENTS.md note (verbatim-move rule replaced; settings contract) | Task 8 |
| final battery + report | Task 9 |

**File structure:**

```
backend/app/modules/identity/api.py                          _me_payload (Task 1), email guard (Task 2)
backend/app/modules/identity/schemas.py                      MeOut (Task 1)
backend/tests/test_auth.py                                   role_name/branches-tz + email-freeze tests (1,2)
apps/web/src/lib/types.ts                                   MeOut branches timezone + role_name (Task 6)
apps/web/src/lib/timezones.ts                               formatTimezone (Task 3)
apps/web/src/lib/timezones.test.ts                          new (Task 3)
apps/web/src/components/password-checklist.tsx               new, extracted (Task 4)
apps/web/src/app/(app)/settings/PlatformSettings.tsx         import from shared (Task 4)
apps/web/src/components/ui.tsx                               Select chevron (Task 5)
apps/web/src/app/(app)/settings/GymSettings.tsx              full rewrite (Task 6)
apps/web/src/components/permission-pills.tsx                 new R/W/U/D matrix (Task 6)
apps/web/e2e/gym_ops_verify.cjs                              settings block retarget (Task 7)
AGENTS.md                                                    GymSettings contract note (Task 8)
```

---

## Task 1 — BE: `/auth/me` gains `role_name` + `branches[].timezone`

**Files:** `backend/app/modules/identity/api.py`, `backend/app/modules/identity/schemas.py`, `backend/tests/test_auth.py`

1.1 In `schemas.py`, extend `MeOut` (L68–75): add `role_name: str | None = None` after `tenant_name`; `branches` stays `list[dict] = []` (dict entries will now carry `timezone`).

1.2 In `api.py` `_me_payload` (L75–97): after the `branches` list comprehension (L87), add role-name resolution (works for platform AND gym users — platform harmless, unused by PlatformSettings):

```python
role_rows = await session.scalars(
    select(Role.name)
    .join(UserRole, UserRole.role_id == Role.id)
    .where(UserRole.user_id == user.id, Role.deleted_at.is_(None))
)
role_name = ", ".join(sorted({r for r in role_rows if r})) or None
```

Change the branches comprehension to include timezone:

```python
branches = [
    {"id": str(b.id), "name": b.name, "timezone": b.timezone}
    for b in branch_rows
]
```

Add `role_name=role_name` to the `MeOut(...)` call. Import `UserRole` alongside the existing `Role` import (L14). `Role` is already imported; extend to `Role, RolePermission, UserRole` as needed (check current import — `Role, RolePermission` already there per L14; add `UserRole`).

1.3 In `test_auth.py`, extend `test_login_and_me` (L13–29) OR add a new focused test `test_me_role_and_branch_timezones`:

```python
async def test_me_role_and_branch_timezones(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    response = await client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["role_name"] is not None and "Owner" in data["role_name"]
    assert len(data["branches"]) >= 1
    for b in data["branches"]:
        assert set(b) >= {"id", "name", "timezone"}
        assert isinstance(b["timezone"], str) and b["timezone"]
```

(Gym owner role name is seeded as "Gym Owner" — assert `"Gym Owner" in data["role_name"]` or `data["role_name"]` truthy; verify against `seed_dev.py`/`ROLE_TEMPLATES` during implementation.)

1.4 Gates: pytest 105→106, ruff clean. Commit: `feat(identity): me payload exposes role_name + branch timezones`.

---

## Task 2 — BE: email freeze for all users + rewrite owner-email tests

**Files:** `backend/app/modules/identity/api.py`, `backend/tests/test_auth.py`

2.1 In `api.py` `update_me_route` (L115–116) drop the `actor.is_platform and` condition — email change is frozen for every user (same-email PATCH passes through as a no-op, matching current platform behavior):

```python
if body.email is not None and body.email.lower() != actor.email.lower():
    raise ForbiddenError("Email can't be changed", code="EMAIL_FROZEN")
```

2.2 **Rewrite the three existing tests that assert owners CAN change email** (they now break — this is the point):

- `test_update_me_profile` (L119–156): keep the name save/restore part. Replace the email-conflict block (L136–149) — the `taken-me-profile@example.com` employee creation + 409 PATCH — with a single non-platform freeze check:
  ```python
  frozen = await client.patch(
      "/api/v1/auth/me", headers=headers, json={"email": "someone-else@example.com"}
  )
  assert frozen.status_code == 403, frozen.text
  assert frozen.json()["detail"]["error"]["code"] == "EMAIL_FROZEN"
  ```
- `test_update_me_email_conflict_other_tenant` (L159–179): rewrite body to expect `403 EMAIL_FROZEN` on the cross-tenant email PATCH (no restore dance needed — nothing landed). Rename optional; keep name, change assertions, update docstring ("email frozen for non-platform too — cross-tenant claim is moot").
- `test_update_me_email_change_lowercased` (L181–204): rewrite to `test_update_me_email_frozen_non_platform`: PATCH `Mixed.Case.Me@Test.COM` → 403 `EMAIL_FROZEN`; PATCH **same current email** → 200 (no-op allowed). Keep a platform-side freeze test if one exists elsewhere (search for existing `EMAIL_FROZEN` platform test — if none, add: platform admin PATCH different email → 403).

2.3 Add explicit non-platform freeze test naming if not covered above: `test_update_me_email_frozen_non_platform` asserting owner PATCH different email → 403 + code.

2.4 Gates: pytest (count may dip if a test merged — assert all green, note final count), ruff clean. Commit: `feat(identity): freeze email for all users, not just platform admins`.

---

## Task 3 — FE: `formatTimezone` + unit test

**Files:** `apps/web/src/lib/timezones.ts`, `apps/web/src/lib/timezones.test.ts` (new)

3.1 In `timezones.ts` (keep `TIMEZONES: string[]` and `normalizeTimezone` unchanged), append:

```ts
export function formatTimezone(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date(0));
    const offset = parts.find((p) => p.type === "timeZoneName")?.value;
    return offset ? `${tz} (${offset})` : tz;
  } catch {
    return tz;
  }
}
```

3.2 New `timezones.test.ts` with `node:test` + `node:assert/strict` (mirror `password.test.ts` style):

- `formatTimezone("Asia/Kolkata") === "Asia/Kolkata (GMT+5:30)"` — **verify exact `Intl` output during implementation** (Node prints "GMT+5:30"; assert with `.includes("GMT")` + `.includes("5:30")` to be safe across ICU versions).
- `formatTimezone("UTC")` includes "UTC" or "GMT".
- `formatTimezone("Not/AZone") === "Not/AZone"` (catch branch).

3.3 Gates: `npm test` 17→18+, tsc clean. Commit: `feat(web): formatTimezone helper for tz chips`.

---

## Task 4 — FE: extract shared `PasswordChecklist` (GATE platform)

**Files:** `apps/web/src/components/password-checklist.tsx` (new), `apps/web/src/app/(app)/settings/PlatformSettings.tsx`

4.1 Create `password-checklist.tsx` — move `CHECK_ROWS` + `PasswordChecklist` verbatim from `PlatformSettings.tsx` L12–35 (export the component; `CHECK_ROWS` stays module-private). Export type usage: import `PasswordRule` from `@/lib/password`.

4.2 In `PlatformSettings.tsx`: delete the local block, add `import { PasswordChecklist } from "@/components/password-checklist";`. Everything else byte-identical (behavior + markup unchanged — the platform suite asserts the `ul[aria-label="Password strength"]` checklist states).

4.3 Gates: tsc clean, `npm test` clean, **`cd apps/web && npx playwright test e2e/platform` → 59 pass / 1 skip**. Commit: `refactor(web): extract shared PasswordChecklist component`.

---

## Task 5 — FE: repo-wide Select chevron (GATE platform)

**Files:** `apps/web/src/components/ui.tsx`

5.1 Replace the `Select` component (L93–103) — keep `appearance-none`, add right-pinned chevron via Tailwind `bg-[right_0.6rem_center]` + `pr-8`, inline SVG chevron absolutely positioned inside a relative wrapper OR simpler: pure CSS background-image on the select itself (no extra DOM, zero layout risk):

```tsx
export function Select({
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        inputBase,
        "cursor-pointer appearance-none bg-panel-strong pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%239ca3af%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22m6 8 4 4 4-4%22/></svg>')] bg-[right_0.55rem_center] bg-no-repeat",
        className,
      )}
      {...rest}
    />
  );
}
```

Verify the data-URI renders (quotes must be `%22`-escaped). If the background approach fights Tailwind JIT, fall back to a `relative` wrapper + absolutely-positioned `<svg>` with `pointer-events-none` — but prefer the CSS background (zero DOM change, Select stays a plain `<select>` for `selectOption`/`inputValue` e2e).

5.2 Gates: tsc clean, platform Playwright 59/1 (gyms modal tier Select + settings tz Select are the risk points), house scripts still green — run `gym_ops` once (33) since it asserts `select.inputValue()` on tz selects (background-image does not affect value). Commit: `feat(web): unified chevron on all Select dropdowns`.

---

## Task 6 — FE: GymSettings rewrite (Profile/Password/Gym+Branch/Role pills)

**Files:** `apps/web/src/app/(app)/settings/GymSettings.tsx` (full rewrite), `apps/web/src/components/permission-pills.tsx` (new), `apps/web/src/lib/types.ts`, `apps/web/src/lib/hooks.ts`

6.1 `types.ts` — extend `MeOut` (L13–19): add `role_name?: string | null;` and change `branches: { id: string; name: string; timezone?: string }[];` (timezone optional so stale cached MeOut mid-deploy doesn't crash; runtime always present from Task 1).

6.2 New `permission-pills.tsx` — pure display, no interactivity:

```tsx
import { cn } from "@/lib/utils";

const MODULES = [
  "attendance", "billing", "expenses", "identity", "members",
  "membership", "notifications", "reports", "tenancy",
] as const;

const VERBS = ["read", "write", "update", "delete"] as const;
type Verb = (typeof VERBS)[number];

const WRITE_SUFFIXES = ["create", "checkin", "activate", "capture", "refund"];

function hasVerb(module: string, verb: Verb, perms: Set<string>): boolean {
  for (const code of perms) {
    if (!code.startsWith(module + ".")) continue;
    if (verb === "read" && (code.endsWith(".view") || code.endsWith(".export"))) return true;
    if (verb === "write" && WRITE_SUFFIXES.some((s) => code.endsWith("." + s))) return true;
    if (verb === "update" && (code.endsWith(".update") || code.endsWith(".manage"))) return true;
    if (verb === "delete" && (code.endsWith(".delete") || code.endsWith(".manage"))) return true;
  }
  return false;
}

export function PermissionPills({ permissions }: { permissions: string[] }) {
  const perms = new Set(permissions);
  const rows = MODULES.filter((m) => [...perms].some((c) => c.startsWith(m + ".")));
  return (
    <div className="mt-3 space-y-2" aria-label="Granted permissions">
      <div className="flex items-center gap-3 text-[11px] font-medium text-ink-faint" aria-hidden>
        <span className="w-24">Module</span>
        {VERBS.map((v) => (
          <span key={v} className="w-10 text-center capitalize">{v}</span>
        ))}
      </div>
      {rows.map((m) => (
        <div key={m} className="flex items-center gap-3 text-[13px]" data-module={m}>
          <span className="w-24 capitalize text-ink-soft">{m}</span>
          {VERBS.map((v) => (
            <span
              key={v}
              aria-disabled="true"
              aria-label={`${m} ${v} ${hasVerb(m, v, perms) ? "on" : "off"}`}
              className={cn(
                "mx-auto inline-flex h-5 w-10 items-center justify-center rounded-full text-[11px] font-medium",
                hasVerb(m, v, perms)
                  ? "bg-accent text-white"
                  : "border border-line bg-fill text-ink-faint",
              )}
            >
              {hasVerb(m, v, perms) ? "✓" : "·"}
            </span>
          ))}
        </div>
      ))}
      {rows.length === 0 && (
        <p className="text-[13px] text-ink-faint">No modules granted.</p>
      )}
    </div>
  );
}
```

(Exact pill sizing/colors tuned to design tokens during implementation; contract: `aria-label="module verb on|off"`, wrapper `aria-label="Granted permissions"` — the e2e retarget in Task 7 relies on these.)

6.3 `GymSettings.tsx` rewrite — full component tree (replaces all 247 lines), in card order:

**State:** `firstName`/`lastName` (init from `me.user` + `full_name` fallback — copy PlatformSettings L40–44), `toast`, `savingProfile`, `current`/`next`/`confirm` + `currentError`/`changingPassword` (copy PlatformSettings L49–59 incl. `passwordChecks`/`allChecksPass`/`canSubmitPassword`), `gymName` (init `me?.tenant_name ?? ""`), `timezone` (init `normalizeTimezone(me?.timezone ?? ...)` — **note:** current code inits from a `useGymSettings` hook; keep that hook, init same way), `savingGym`, plus branch-access state unchanged (cross-branch toggle etc. — keep existing `useUpdateGymSettings`/`useUpdateBranch` wiring verbatim from current file, just relocated under the merged card).

**Card 1 — Profile:** `SectionTitle title="Profile" subtitle="Your account details across the organization"`. First name / Last name inputs with `id`/`aria-label` `settings-first-name`/`settings-last-name`. Email input: `id="settings-email"`, `readOnly`, `disabled`, `aria-readonly="true"`, value `user?.email`. Helper `<p className="mt-2 text-[12px] text-ink-faint">Email can&apos;t be changed.</p>`. Save button `saveProfile` — copy PlatformSettings L61–88 **verbatim** (PATCH `{first_name, last_name}` → `refreshMe(updated)` → notify "Profile updated"; 403→"Email can't be changed" toast retained for safety; 422→message; else connection error). Button disabled on `firstName.trim().length < 1`.

**Card 2 — Password:** `SectionTitle title="Password" subtitle="Change your account password"`. Copy the entire PlatformSettings password card L176–227 verbatim (3 fields with `settings-current-password`/`settings-new-password`/`settings-confirm-password` ids, `PasswordChecklist` from shared import, mismatch error, `savePassword` — L90–126 verbatim: POST `/auth/change-password` → `completePasswordChange` → clear → "Password updated"; `INVALID_CURRENT_PASSWORD`→inline error; `PASSWORD_TOO_WEAK`→toast with failed rules). **Never called by e2e** (fixture-hygiene rule).

**Card 3 — Gym profile & branch access** (owner-only: wrap in `can("tenancy.settings.manage")` — keep existing gate variable from current file):
- `SectionTitle title="Gym profile & branch access"` **or** keep `title="Gym profile"` — **e2e decision:** Task 7 will pin the new heading; use `title="Gym profile & branch access"`.
- Gym name input (`#settings-gym-name`) + timezone select (`#settings-timezone`) with option labels via `formatTimezone(tz)` — `<option key={tz} value={tz}>{formatTimezone(tz)}</option>` — and "Save gym profile" button (existing `saveGym` logic diffing name/timezone, toast "Gym profile updated", `refreshMe` for tenant name).
- Branch access section BELOW gym fields: `SectionTitle title="Branch access"` (keep — e2e pins it), cross-branch switch + branch chips. Each chip shows branch name + `formatTimezone(b.timezone)` when present: `<Badge>` or small text span `— {formatTimezone(b.timezone)}`. Save-branch timezone stays on branches page (out of scope).

**Card 4 — Role & permissions** (all gym roles):
- `SectionTitle title="Role & permissions" subtitle="Your role and what it can do"`.
- Role line: `me?.role_name ?? "Member"` rendered as a Badge.
- `<PermissionPills permissions={me?.permissions ?? []} />` — replaces the old `Granted permissions` heading + raw list. Wrapper has `aria-label="Granted permissions"` (Task 7 pins it).

**Card 5 — Danger zone:** keep EXISTING danger-zone block verbatim at the bottom (owner-only, unchanged).

**Toast:** single `Toast` at the end (copy current pattern).

6.4 `hooks.ts` — `useUpdateMe` already exists (L815) and takes first/last name; no change needed. No new hooks required (`useGymSettings`/`useUpdateGymSettings`/`useUpdateBranch` already used by current file — keep imports).

6.5 Gates: tsc clean, `npm test` clean, **platform Playwright 59/1** (shared-file rule — `types.ts` touched). House scripts WILL FAIL until Task 7 (gym_ops settings block) — that's expected; do NOT commit a gym_ops-breaking state without Task 7 in the same commit. **Commit Tasks 6+7 together** (see Task 7).

---

## Task 7 — e2e: gym_ops_verify.cjs L205–293 retarget (same commit as Task 6)

**Files:** `apps/web/e2e/gym_ops_verify.cjs`

7.1 Replace the settings block (L205–293) — new assertions against the rewritten UI:

```js
// ── Settings ──
await page.goto(`${BASE}/settings`);
await settle(page);
await page.getByText("Profile", { exact: true }).waitFor({ timeout: 15000 });
await page.getByText("Role & permissions", { exact: true }).waitFor({ timeout: 15000 });
await must("settings: page renders profile / role pills / branch access",
  page.getByText("Branch access", { exact: true }).waitFor({ timeout: 15000 }));
// R/W/U/D pills render and are non-interactive
const readPill = page.locator('[aria-label="members read on"]').first();
await must("settings: permission pills render read=on for members",
  readPill.waitFor({ timeout: 15000 }));
await must("settings: permission pills are aria-disabled",
  (await readPill.getAttribute("aria-disabled")) === "true");
```

7.2 Cross-branch toggle block (L212–244): keep VERBATIM (still under branch-access area, same switch label).

7.3 Profile save block (L246–262): retarget — the profile card locator `hasText: "Your account details across the organization"` STAYS (subtitle unchanged). But `input.first()` no longer = full name — now first-name input. Retarget to `#settings-first-name`:

```js
const firstNameInput = profileCard.locator("#settings-first-name");
const lastNameInput = profileCard.locator("#settings-last-name");
const origFirst = await firstNameInput.inputValue();
const origLast = await lastNameInput.inputValue();
await firstNameInput.fill(`${origFirst} E2E`);
await profileCard.getByRole("button", { name: "Save changes" }).click();
await page.getByText("Profile updated", { exact: true }).waitFor({ timeout: 10000 });
await must("settings: profile name save persists (sidebar refreshes)",
  page.locator("aside").getByText(`${origFirst} E2E`, { exact: true }).waitFor({ timeout: 15000 }));
await firstNameInput.fill(origFirst);
await profileCard.getByRole("button", { name: "Save changes" }).click();
await page.locator("aside").getByText(origFirst, { exact: true }).waitFor({ timeout: 15000 });
```

(Sidebar shows full name — `${origFirst} E2E ${origLast}` — the `getByText(origFirst + " E2E", { exact: true })` may need non-exact or include last name; verify sidebar rendering during implementation and pin the exact string.)

7.4 Gym card block (L264–293): card heading is now "Gym profile & branch access" — `hasText: "Gym profile"` still matches as substring ✓ (keep `hasText: "Gym profile"`). Input/select indices: gym name is still first input in card, tz select still first select (branch chips are text, not inputs). **Keep the whole block as-is** — verify indices hold during run. If branch chips introduce an earlier select, retarget to `#settings-gym-name`/`#settings-timezone` ids.

7.5 Email frozen check (NEW, cheap):

```js
await must("settings: email input is read-only",
  (await profileCard.locator("#settings-email").getAttribute("disabled")) !== null);
```

7.6 Gates: `gym_ops` **33/33** (may grow if new `must()` lines added — count up is fine, report final), platform Playwright still 59/1, tsc clean. **Commit Tasks 6+7 together:** `feat(web): gym settings redesign — profile/password/gym/role cards`.

---

## Task 8 — AGENTS.md contract note

**Files:** `AGENTS.md`

8.1 Replace the `GymSettings.tsx` "verbatim move" paragraph in the **Settings page is role-split** section with the new contract:

```markdown
- `GymSettings.tsx` (everyone else): five cards — Profile (split
  first/last name save via `PATCH /auth/me`, frozen email readOnly),
  Password (3-field + live checklist, shared `PasswordChecklist`
  component), Gym profile & branch access (owner-gated gym name/tz +
  branch chips showing per-branch tz), Role & permissions (role badge +
  read-only R/W/U/D `PermissionPills`), Danger zone (owner-gated).
  Selectors are a contract with `e2e/gym_ops_verify.cjs` (33/33).
- `PlatformSettings.tsx` (platform only): same Profile + Password cards
  (shared `PasswordChecklist`); no gym/role/danger sections.
```

8.2 Keep the frozen-surface rules, password-complexity, fixture-hygiene, Playwright-suite, CPU-budget, and dev-server sections UNCHANGED.

8.3 Gates: none (docs). Commit: `docs: update GymSettings contract in AGENTS.md`.

---

## Task 9 — final battery + report

Run from repo root, sequentially:

```bash
cd backend && .venv/bin/python -m pytest -q && .venv/bin/ruff check app tests scripts alembic
cd ../apps/web && npx tsc --noEmit && npm test
cd apps/web && npx playwright test e2e/platform          # 59 pass / 1 skip
cd apps/web && NODE_PATH="$(npm root -g)" node e2e/gym_ops_verify.cjs        # 33+
cd apps/web && NODE_PATH="$(npm root -g)" node e2e/plans_verify.cjs          # 9
cd apps/web && NODE_PATH="$(npm root -g)" node e2e/member_account_verify.cjs # 15
cd apps/web && NODE_PATH="$(npm root -g)" node e2e/role_visibility_verify.cjs # 18
cd apps/web && NODE_PATH="$(npm root -g)" node e2e/frontdesk_verify.cjs      # 29
cd apps/web && NODE_PATH="$(npm root -g)" node e2e/expenses_verify.cjs       # 13
```

Also verify live-DB hygiene: admin full_name still "Platform Admin"; `SELECT name FROM gyms WHERE name LIKE 'PW %' AND deleted_at IS NULL` → offer purge to user if rows remain (do not auto-delete).

Report: final pytest count, each gate result, any retargets made, working tree clean. If ALL green, this round is done — no merge/PR (direct-to-main convention).

---

## Notes for implementers

- **Parallel dispatch allowed** for independent tasks: Tasks 1+2 (backend, one agent), Task 3 (timezones, independent), Tasks 4+5 (shared components, one agent — both GATE platform). Task 6+7 MUST be one sequential agent (same commit). Task 8 independent. Run gates after each merge.
- PlatformSettings.tsx, PlatformPlaywright suite, and frozen `/platform/**` pages: DO NOT touch beyond the Task 4 import swap.
- The pill matrix is COMPUTED from `me.permissions` — never hardcode module/verb rows. Owner will show most modules ON; receptionist/trainer show reduced sets (role_visibility e2e already seeds these — no new fixtures needed).
- `Intl.DateTimeFormat` output format varies by Node ICU build — unit tests must assert loosely (`includes`), e2e only `selectOption`s raw IANA values (format only affects the visible label).
- If a house-script assertion breaks on the new UI mid-round, fix it in the SAME commit as the UI change (house rules) — never leave main broken.
