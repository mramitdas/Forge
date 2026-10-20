# Super-admin Playwright Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `e2e/platform_admin_verify.cjs` with a proper `@playwright/test` suite covering every super-admin surface except revenue (~105-125 tests), and encode the AGENTS.md gate rule.

**Architecture:** `playwright.config.ts` + auth-setup project (one admin login → `storageState`) + six per-module spec files under `e2e/platform/` with shared helpers in `fixtures.ts`. Throwaway timestamped data, cleanup in `afterAll`, subscriptions serial. The old verify script is deleted in the final task; the other six house-style e2e scripts are untouched.

**Tech Stack:** `@playwright/test@^1.64.1` (matches existing local `playwright` devDep), Node 22, running dev servers (`make dev` :8000, `make web` :3000).

**Spec:** `docs/superpowers/specs/2026-10-20-platform-playwright-suite-design.md`

---

## Ground rules (apply to every task)

- Repo `/Users/amit/Documents/Forge`, branch `main`, commit directly. NEVER `git add -A`.
- **Servers must already be running** (`make dev` + `make web`). Never restart them mid-session; Next/uvicorn hot-reload handles changes.
- Gate command (used in every task): `cd apps/web && npx playwright test e2e/platform`
- Known flake class: first-nav login timeouts — `retries: 1` is configured; if a run shows a first-test-only timeout, re-run once after confirming :3000/:8000 respond.
- **Shared-fixture hygiene (hard rules):**
  - Never submit a real password change for `admin@gym-erp.dev` (password stays `admin-pass-123`).
  - Any settings test that changes the admin name MUST restore `Platform`/`Admin` in a `finally`.
  - Throwaway gyms/tiers created by a spec file MUST be cleaned up in `afterAll` (or inside the delete test).
- Test toast assertions: toasts render in a persistent `div[role="status"]` portal; assert with `page.getByText(...)` or `expectToast(page, "...")` helper (defined in Task 1). Toasts do NOT auto-dismiss — call `dismissToasts(page)` before asserting a new toast if multiple fire in sequence.
- Modals: `page.getByRole("dialog")`; title `#modal-title`; close button `aria-label="Close"`.
- Gyms provision submit button collides with the toolbar button on accessible name — use `dialog.getByRole("button", { name: "Provision gym" })` (scoped to dialog, no `.last()` hack needed once we have `getByRole("dialog")`).
- Row locators: `page.locator("tr", { hasText: text }).first()` — table rows contain nested text; always `.first()` or scope by unique text.
- Native HTML5 validation blocks submit before any request (required/type/pattern). To assert "blocked", check the dialog stays open and NO toast appears.

---

### Task 1: Infrastructure — config, auth setup, fixtures, smoke

**Files:**
- Modify: `apps/web/package.json` (devDependency + script)
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/platform/auth.setup.ts`
- Create: `apps/web/e2e/platform/fixtures.ts`
- Create: `apps/web/e2e/platform/smoke.spec.ts` (temporary — deleted in Task 2 when overview.spec.ts lands; exists only to prove the runner works)
- Modify: `apps/web/.gitignore` (add Playwright artifacts)

- [ ] **Step 1: Install the runner**

```bash
cd apps/web && npm install -D @playwright/test@^1.64.1
```

Expected: adds `@playwright/test` to devDependencies at 1.64.x (same minor as existing `playwright`).

- [ ] **Step 2: Add npm script + gitignore entries**

In `apps/web/package.json` scripts, add:

```json
    "test:e2e:platform": "playwright test e2e/platform"
```

In `apps/web/.gitignore`, append:

```
# Playwright
test-results/
playwright-report/
```

- [ ] **Step 3: Create the config**

`apps/web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

// E2E runs against the RUNNING dev servers (make dev → :8000, make web →
// :3000). No webServer block on purpose — never let Playwright start/stop
// the servers mid-session.
export default defineConfig({
  testDir: ".",
  testMatch: /e2e\/platform\/.*\.(spec|setup)\.ts/,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "auth-setup", testMatch: /e2e\/platform\/auth\.setup\.ts/ },
    {
      name: "platform",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["auth-setup"],
      use: {
        storageState: "test-results/.auth/admin.json",
      },
    },
  ],
});
```

- [ ] **Step 4: Create the auth setup**

`apps/web/e2e/platform/auth.setup.ts`:

```ts
import { test as setup, expect } from "@playwright/test";

const ADMIN = { email: "admin@gym-erp.dev", password: "admin-pass-123" };
const AUTH_FILE = "test-results/.auth/admin.json";

setup("authenticate as platform admin", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: /enter forge/i }).click();
  await page.waitForURL(/\/platform/, { timeout: 20000 });
  await expect(page.getByRole("button", { name: /exit to platform/i })).toHaveCount(0);
  await page.context().storageState({ path: AUTH_FILE });
});
```

- [ ] **Step 5: Create the shared fixtures/helpers**

`apps/web/e2e/platform/fixtures.ts`:

```ts
import { expect, type Page } from "@playwright/test";

export function ts(): string {
  return Date.now().toString(36);
}

export async function dismissToasts(page: Page): Promise<void> {
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  while ((await dismiss.count()) > 0) {
    await dismiss.first().click();
  }
}

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).last()).toBeVisible({ timeout: 15000 });
  await dismissToasts(page);
}

export type ProvisionGymOpts = {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  tierCode?: string;
};

export async function provisionGym(page: Page, opts: ProvisionGymOpts): Promise<void> {
  await page.goto("/platform/gyms");
  await page.getByRole("button", { name: "Provision gym" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#gym-name").fill(opts.name);
  await dialog.locator("#gym-slug").fill(opts.slug);
  if (opts.tierCode) await dialog.locator("#gym-tier").selectOption(opts.tierCode);
  await dialog.locator("#gym-owner-name").fill(opts.ownerName);
  await dialog.locator("#gym-owner-email").fill(opts.ownerEmail);
  await dialog.locator("#gym-owner-password").fill(opts.ownerPassword);
  await dialog.getByRole("button", { name: "Provision gym" }).click();
  await expectToast(page, "Gym provisioned — owner can log in now");
}

export async function deleteGymIfExists(page: Page, name: string): Promise<void> {
  await page.goto("/platform/gyms");
  const row = page.locator("tr", { hasText: name }).first();
  if ((await row.count()) === 0) return;
  if ((await row.getByRole("button", { name: "Delete" }).count()) === 0) return; // already deleted
  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
  await expectToast(page, `${name} deleted`);
}

export function gymRow(page: Page, name: string) {
  return page.locator("tr", { hasText: name }).first();
}
```

- [ ] **Step 6: Smoke spec (temporary)**

`apps/web/e2e/platform/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ts } from "./fixtures";

test("storageState lands on /platform", async ({ page }) => {
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/platform/);
  await expect(page.getByText(/Good morning/)).toBeVisible({ timeout: 20000 });
});

test("fixtures generate unique slugs", () => {
  expect(ts()).toMatch(/^[a-z0-9]+$/);
});
```

- [ ] **Step 7: Run the smoke suite**

Run: `cd apps/web && npx playwright test e2e/platform`
Expected: `auth-setup` passes (1), `platform` project 2 smoke tests pass — 3 passed. First run generates `test-results/.auth/admin.json`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/playwright.config.ts apps/web/e2e/platform/ apps/web/.gitignore
git commit -m "test(e2e): playwright runner infra + admin auth setup

@playwright/test config (no webServer — runs against dev servers),
storageState login fixture, shared toast/provision helpers."
```

---

### Task 2: overview.spec.ts

**Files:**
- Delete: `apps/web/e2e/platform/smoke.spec.ts`
- Create: `apps/web/e2e/platform/overview.spec.ts`

- [ ] **Step 1: Write the spec**

`apps/web/e2e/platform/overview.spec.ts` — smoke.test.ts's two checks are absorbed here (storageState landing + greeting), so the smoke file goes.

```ts
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/platform");
});

test("greeting header and platform kicker render", async ({ page }) => {
  await expect(page.getByText(/Good morning/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/· Platform/)).toBeVisible();
});

test("header shows totals line", async ({ page }) => {
  await expect(page.getByText(/\d+ gyms on the platform · \d+ gym owners/)).toBeVisible({ timeout: 20000 });
});

test("four stat cards render with expected labels", async ({ page }) => {
  for (const label of ["Total gyms", "Active gyms", "Gym owners", "Monthly revenue"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 20000 });
  }
});

test("monthly revenue renders in ₹", async ({ page }) => {
  const card = page.locator("div.glass", { hasText: "Monthly revenue" }).first();
  await expect(card).toContainText(/₹/, { timeout: 20000 });
});

test("gym subscriptions table shows column headers", async ({ page }) => {
  await expect(page.getByText("Gym subscriptions")).toBeVisible({ timeout: 20000 });
  for (const h of ["Gym", "Tier", "Status", "Members", "Active subs"]) {
    await expect(page.getByRole("columnheader", { name: h, exact: true })).toBeVisible();
  }
});

test("subscription rows have a tier select and changing tier toasts success", async ({ page }) => {
  await expect(page.getByText("Gym subscriptions")).toBeVisible({ timeout: 20000 });
  const row = page.locator("tbody tr").first();
  const tierSelect = row.getByRole("combobox", { name: "Tier" });
  await expect(tierSelect).toBeVisible();
  const original = await tierSelect.inputValue();
  const target = original === "pro" ? "starter" : "pro";
  await tierSelect.selectOption(target);
  await expect(page.getByText("Subscription tier updated")).toBeVisible({ timeout: 15000 });
  // restore
  await row.getByRole("combobox", { name: "Tier" }).selectOption(original);
  await expect(page.getByText("Subscription tier updated")).toBeVisible({ timeout: 15000 });
});

test("gym registry lists gyms with Manage links", async ({ page }) => {
  await expect(page.getByText("Gym registry")).toBeVisible({ timeout: 20000 });
  const manage = page.getByRole("link", { name: /Manage →/ });
  await expect(manage.first()).toBeVisible();
  await expect(manage.first()).toHaveAttribute("href", "/platform/gyms");
});

test("View all gyms link navigates to gyms page", async ({ page }) => {
  await page.getByRole("link", { name: /View all gyms →/ }).click();
  await expect(page).toHaveURL(/\/platform\/gyms/);
  await expect(page.getByRole("button", { name: "Provision gym" })).toBeVisible({ timeout: 20000 });
});
```

- [ ] **Step 2: Delete the smoke spec, run**

```bash
rm apps/web/e2e/platform/smoke.spec.ts
cd apps/web && npx playwright test e2e/platform
```

Expected: auth-setup + 9 overview tests pass (10 total).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/platform/
git commit -m "test(e2e): platform overview dashboard spec"
```

---

### Task 3: gyms.spec.ts — provision, validation, edit

**Files:**
- Create: `apps/web/e2e/platform/gyms.spec.ts`

One gym `PW Gym {ts}` is provisioned in `beforeAll` and used by edit tests; the provision-specific tests each create their own throwaway and delete it inline. Lifecycle (suspend/delete/restore) is Task 4 in the same file — implement Task 3's describe block only; Task 4 appends a second describe.

- [ ] **Step 1: Write the spec**

`apps/web/e2e/platform/gyms.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ts, provisionGym, deleteGymIfExists, dismissToasts, expectToast, gymRow } from "./fixtures";

const T = ts();
const GYM = `PW Gym ${T}`;
const SLUG = `pw-${T}`;
const OWNER_EMAIL = `pw-owner-${T}@gym-erp.dev`;
const OWNER_PASSWORD = "Pw-Provision-123!";

test.describe("gyms — provision & edit", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await provisionGym(page, {
      name: GYM, slug: SLUG, ownerName: "PW Owner",
      ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD,
    });
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await deleteGymIfExists(page, GYM);
    await page.context().close();
  });

  test("page header shows gym count and Provision button", async ({ page }) => {
    await page.goto("/platform/gyms");
    await expect(page.getByText(/\d+ gyms on the platform/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "Provision gym" })).toBeVisible();
  });

  test("table column headers render", async ({ page }) => {
    await page.goto("/platform/gyms");
    for (const h of ["Gym", "Slug", "Status", "Tier", "Cross-branch", "Actions"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: true })).toBeVisible({ timeout: 20000 });
    }
  });

  test("provisioned gym row shows slug, status badge, tier", async ({ page }) => {
    await page.goto("/platform/gyms");
    const row = gymRow(page, GYM);
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText(SLUG);
    await expect(row.getByText(/^(active|trial|suspended)$/)).toBeVisible();
    await expect(row).toContainText(/starter|pro|enterprise/);
  });

  test("provision happy path (own throwaway, deleted inline)", async ({ page }) => {
    const t = ts();
    const name = `PW Once ${t}`;
    await provisionGym(page, {
      name, slug: `pw-once-${t}`, ownerName: "PW Once",
      ownerEmail: `pw-once-${t}@gym-erp.dev`, ownerPassword: OWNER_PASSWORD,
    });
    await expect(gymRow(page, name)).toBeVisible({ timeout: 15000 });
    await deleteGymIfExists(page, name);
    await expect(gymRow(page, name)).toHaveCount(0);
  });

  test("duplicate slug surfaces Could not provision gym", async ({ page }) => {
    await page.goto("/platform/gyms");
    await page.getByRole("button", { name: "Provision gym" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#gym-name").fill(`PW Dup ${T}`);
    await dialog.locator("#gym-slug").fill(SLUG); // already taken
    await dialog.locator("#gym-owner-name").fill("PW Dup");
    await dialog.locator("#gym-owner-email").fill(`pw-dup-${T}@gym-erp.dev`);
    await dialog.locator("#gym-owner-password").fill(OWNER_PASSWORD);
    await dialog.getByRole("button", { name: "Provision gym" }).click();
    await expectToast(page, "Could not provision gym");
    await expect(dialog).toBeVisible(); // modal stays open
  });

  test("weak owner password surfaces Could not provision gym", async ({ page }) => {
    const t = ts();
    await page.goto("/platform/gyms");
    await page.getByRole("button", { name: "Provision gym" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#gym-name").fill(`PW Weak ${t}`);
    await dialog.locator("#gym-slug").fill(`pw-weak-${t}`);
    await dialog.locator("#gym-owner-name").fill("PW Weak");
    await dialog.locator("#gym-owner-email").fill(`pw-weak-${t}@gym-erp.dev`);
    await dialog.locator("#gym-owner-password").fill("weak-pass-123"); // no uppercase
    await dialog.getByRole("button", { name: "Provision gym" }).click();
    await expectToast(page, "Could not provision gym");
  });

  test("invalid email is blocked by native validation (dialog stays, no toast)", async ({ page }) => {
    await page.goto("/platform/gyms");
    await page.getByRole("button", { name: "Provision gym" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#gym-name").fill("PW Bad Email");
    await dialog.locator("#gym-slug").fill(`pw-bad-email-${T}`);
    await dialog.locator("#gym-owner-name").fill("PW Bad");
    await dialog.locator("#gym-owner-email").fill("not-an-email");
    await dialog.locator("#gym-owner-password").fill(OWNER_PASSWORD);
    await dialog.getByRole("button", { name: "Provision gym" }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/provisioned|Could not/)).toHaveCount(0);
  });

  test("empty required field blocks submit", async ({ page }) => {
    await page.goto("/platform/gyms");
    await page.getByRole("button", { name: "Provision gym" }).click();
    const dialog = page.getByRole("dialog");
    // fill everything EXCEPT gym name
    await dialog.locator("#gym-slug").fill(`pw-empty-${T}`);
    await dialog.locator("#gym-owner-name").fill("PW Empty");
    await dialog.locator("#gym-owner-email").fill(`pw-empty-${T}@gym-erp.dev`);
    await dialog.locator("#gym-owner-password").fill(OWNER_PASSWORD);
    await dialog.getByRole("button", { name: "Provision gym" }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/provisioned|Could not/)).toHaveCount(0);
  });

  test("edit modal updates name, timezone, currency, tier", async ({ page }) => {
    await page.goto("/platform/gyms");
    await gymRow(page, GYM).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#gym-edit-name")).toHaveValue(GYM);
    await dialog.locator("#gym-edit-name").fill(`${GYM} Edited`);
    await dialog.locator("#gym-edit-timezone").selectOption("Europe/Paris");
    await dialog.locator("#gym-edit-currency").selectOption("USD");
    await dialog.locator("#gym-edit-tier").selectOption("pro");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Gym updated");
    const row = gymRow(page, `${GYM} Edited`);
    await expect(row).toContainText("Europe/Paris");
    await expect(row).toContainText("USD");
    await expect(row).toContainText("pro");
    // restore original values for other tests in this file
    await row.getByRole("button", { name: "Edit" }).click();
    await dialog.locator("#gym-edit-name").fill(GYM);
    await dialog.locator("#gym-edit-timezone").selectOption("Asia/Kolkata");
    await dialog.locator("#gym-edit-currency").selectOption("INR");
    await dialog.locator("#gym-edit-tier").selectOption("starter");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Gym updated");
  });

  test("cross-branch switch toggles and toasts", async ({ page }) => {
    await page.goto("/platform/gyms");
    const row = gymRow(page, GYM);
    const toggle = row.getByRole("switch", { name: `Cross-branch access for ${GYM}` });
    const before = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await expectToast(page, "Gym setting updated");
    await expect(gymRow(page, GYM).getByRole("switch", { name: `Cross-branch access for ${GYM}` })).toHaveAttribute(
      "aria-checked", before === "true" ? "false" : "true",
    );
    // toggle back
    await gymRow(page, GYM).getByRole("switch", { name: `Cross-branch access for ${GYM}` }).click();
    await expectToast(page, "Gym setting updated");
  });

  test("cancel closes provision modal without creating", async ({ page }) => {
    await page.goto("/platform/gyms");
    await page.getByRole("button", { name: "Provision gym" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("modal close button dismisses edit dialog", async ({ page }) => {
    await page.goto("/platform/gyms");
    await gymRow(page, GYM).getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
```

Note: `dismissToasts` is imported for Task 4's append; if linters complain about the unused import in Task 3, leave it (Task 4 uses it) or drop and re-add in Task 4 — implementer's call, tsc via playwright transpile doesn't fail on unused imports.

- [ ] **Step 2: Run**

Run: `cd apps/web && npx playwright test e2e/platform/gyms.spec.ts`
Expected: auth-setup + all gyms tests pass. Iterate on selectors only if a real mismatch surfaces (report deviation).

- [ ] **Step 3: Full platform run**

Run: `cd apps/web && npx playwright test e2e/platform`
Expected: everything green (auth + overview + gyms).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/platform/gyms.spec.ts
git commit -m "test(e2e): gyms provision, validation, edit, cross-branch"
```

---

### Task 4: gyms.spec.ts — lifecycle (suspend, delete, restore, attach)

**Files:**
- Modify: `apps/web/e2e/platform/gyms.spec.ts` (append a second describe block)

- [ ] **Step 1: Append the lifecycle describe**

Append to `gyms.spec.ts`:

```ts
test.describe("gyms — lifecycle", () => {
  const T = ts();
  const GYM = `PW Life ${T}`;
  const SLUG = `pw-life-${T}`;
  const OWNER_EMAIL = `pw-life-${T}@gym-erp.dev`;

  test.beforeAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await provisionGym(page, {
      name: GYM, slug: SLUG, ownerName: "PW Life",
      ownerEmail: OWNER_EMAIL, ownerPassword: "Pw-Provision-123!",
    });
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await deleteGymIfExists(page, GYM);
    await page.context().close();
  });

  test("suspend then enable round-trips", async ({ page }) => {
    await page.goto("/platform/gyms");
    await gymRow(page, GYM).getByRole("button", { name: "Suspend" }).click();
    await expectToast(page, `${GYM} suspended`);
    await expect(gymRow(page, GYM).getByText("suspended")).toBeVisible();
    await gymRow(page, GYM).getByRole("button", { name: "Enable" }).click();
    await expectToast(page, `${GYM} is now active`);
    await expect(gymRow(page, GYM).getByText(/active|trial/)).toBeVisible();
  });

  test("delete removes gym from default list; Show deleted + Restore brings it back", async ({ page }) => {
    await page.goto("/platform/gyms");
    await gymRow(page, GYM).getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#modal-title")).toHaveText("Delete gym");
    await dialog.getByRole("button", { name: "Delete gym" }).click();
    await expectToast(page, `${GYM} deleted`);
    await expect(gymRow(page, GYM)).toHaveCount(0);

    await page.getByLabel("Show deleted").check();
    const deletedRow = gymRow(page, GYM);
    await expect(deletedRow).toBeVisible({ timeout: 15000 });
    await deletedRow.getByRole("button", { name: "Restore" }).click();
    await expectToast(page, `${GYM} restored`);
    await page.getByLabel("Show deleted").uncheck();
    await expect(gymRow(page, GYM)).toBeVisible({ timeout: 15000 });
  });

  test("restore with a disabled tier opens the Attach subscription modal", async ({ page }) => {
    // Step 1: delete the gym.
    await page.goto("/platform/gyms");
    await gymRow(page, GYM).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
    await expectToast(page, `${GYM} deleted`);

    // Step 2: disable a tier the gym no longer references (create+use a dedicated tier).
    const tierCode = `pwlife-${T}`;
    await page.goto("/platform/subscriptions");
    await page.getByRole("button", { name: /new tier/i }).click();
    let dialog = page.getByRole("dialog");
    await dialog.locator("#tier-code").fill(tierCode);
    await dialog.locator("#tier-name").fill("PW Life Tier");
    await dialog.locator("#tier-monthly-price").fill("499");
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expectToast(page, "Tier created");

    // Point the (deleted) gym at this tier via restore-attach later — for the
    // attach-modal trigger we instead re-point using edit on a live gym is not
    // possible; the real trigger is TIER_MISSING/TIER_DISABLED on restore.
    // Disable the tier now that no live gym uses it.
    const card = page.locator("div.rounded-2xl", { hasText: tierCode }).first();
    await card.getByRole("switch").click();
    await expectToast(page, new RegExp("is now disabled"));

    // Step 3: re-provision a gym ON that tier while it was active is impossible
    // (disabled tiers are hidden from provision). So: enable tier, provision
    // gym on it, disable tier requires gym deleted first. Do it in order:
    await card.getByRole("switch").click();
    await expectToast(page, new RegExp("is now active"));
    const t2 = `${T}b`;
    const name2 = `PW Life2 ${t2}`;
    await provisionGym(page, {
      name: name2, slug: `pw-life2-${t2}`, ownerName: "PW Life2",
      ownerEmail: `pw-life2-${t2}@gym-erp.dev`, ownerPassword: "Pw-Provision-123!",
      tierCode,
    });
    await page.goto("/platform/gyms");
    await gymRow(page, name2).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
    await expectToast(page, `${name2} deleted`);
    await page.goto("/platform/subscriptions");
    await page.locator("div.rounded-2xl", { hasText: tierCode }).first().getByRole("switch").click();
    await expectToast(page, new RegExp("is now disabled"));

    // Step 4: restore → attach modal.
    await page.goto("/platform/gyms");
    await page.getByLabel("Show deleted").check();
    await gymRow(page, name2).getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("dialog").locator("#modal-title")).toHaveText("Attach a subscription", { timeout: 15000 });
    await page.getByRole("dialog").locator("#attach-tier").selectOption(tierCode);
    await page.getByRole("dialog").getByRole("button", { name: "Restore gym" }).click();
    await expectToast(page, `${name2} restored`);
    await page.getByLabel("Show deleted").uncheck();

    // cleanup second gym + tier
    await deleteGymIfExists(page, name2);
    await page.goto("/platform/subscriptions");
    await page.locator("div.rounded-2xl", { hasText: tierCode }).first().getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete tier" }).click();
    await expectToast(page, new RegExp("deleted"));
  });

  test("Show deleted checkbox toggles the filtered query", async ({ page }) => {
    await page.goto("/platform/gyms");
    await page.getByLabel("Show deleted").check();
    await expect(page.getByLabel("Show deleted")).toBeChecked();
    await page.getByLabel("Show deleted").uncheck();
    await expect(page.getByLabel("Show deleted")).not.toBeChecked();
  });
});
```

Note on the attach test: the flow is intentionally end-to-end (create tier → gym on it → delete gym → disable tier → restore → attach modal → pick tier → restore succeeds). The first half of the draft (disable/re-enable before provisioning) is scaffolding the tier into a known state — if a simpler ordering emerges while implementing (e.g. create tier, provision on it, then delete+disable), simplify, but keep the observable assertions: **Attach a subscription** modal, `#attach-tier` select, restore success toast.

- [ ] **Step 2: Run**

Run: `cd apps/web && npx playwright test e2e/platform/gyms.spec.ts`
Expected: all pass (both describes). The lifecycle attach test is the longest (~1-2 min).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/platform/gyms.spec.ts
git commit -m "test(e2e): gyms suspend/enable, delete/restore, attach-on-restore"
```

---

### Task 5: owners.spec.ts

**Files:**
- Create: `apps/web/e2e/platform/owners.spec.ts`

Uses a throwaway owner provisioned in `beforeAll` (via the fixtures helper); the seeded real owners are only read, never mutated.

- [ ] **Step 1: Write the spec**

`apps/web/e2e/platform/owners.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ts, provisionGym, deleteGymIfExists, expectToast } from "./fixtures";

const T = ts();
const OWNER_EMAIL = `pw-own-${T}@gym-erp.dev`;
const OWNER_NAME = "PW Owner";

test.describe("owners", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await provisionGym(page, {
      name: `PW OwnGym ${T}`, slug: `pw-owngym-${T}`, ownerName: OWNER_NAME,
      ownerEmail: OWNER_EMAIL, ownerPassword: "Pw-Provision-123!",
    });
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await deleteGymIfExists(page, `PW OwnGym ${T}`);
    await page.context().close();
  });

  const ownerRow = (page: import("@playwright/test").Page) =>
    page.locator("tr", { hasText: OWNER_EMAIL }).first();

  test("page shows owner count and table headers", async ({ page }) => {
    await page.goto("/platform/owners");
    await expect(page.getByText(/\d+ gym owners/)).toBeVisible({ timeout: 20000 });
    for (const h of ["Owner", "Gym", "Status", "Actions"]) {
      await expect(page.getByRole("columnheader", { name: h, exact: true })).toBeVisible();
    }
  });

  test("provisioned owner appears with gym name and active status", async ({ page }) => {
    await page.goto("/platform/owners");
    const row = ownerRow(page);
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText(OWNER_NAME);
    await expect(row).toContainText(`PW OwnGym ${T}`);
    await expect(row).toContainText(/active|trial/);
  });

  test("edit modal updates full name", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#modal-title")).toHaveText("Edit gym owner");
    await dialog.locator("#owner-full-name").fill(`${OWNER_NAME} Renamed`);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Owner updated");
    await expect(ownerRow(page)).toContainText(`${OWNER_NAME} Renamed`);
    // rename back
    await ownerRow(page).getByRole("button", { name: "Edit" }).click();
    await dialog.locator("#owner-full-name").fill(OWNER_NAME);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Owner updated");
  });

  test("password reset with a strong password succeeds", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#owner-reset-password").fill("Pw-Reset-456!");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Owner updated");
  });

  test("duplicate email surfaces Could not update owner", async ({ page }) => {
    // Grab a different owner's email from the table (the seeded admin-adjacent
    // owners), then try to set our throwaway owner's email to it.
    await page.goto("/platform/owners");
    const otherRow = page.locator("tbody tr").filter({ hasNotText: OWNER_EMAIL }).first();
    const otherEmail = (await otherRow.innerText()).match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
    expect(otherEmail).toBeTruthy();
    await ownerRow(page).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#owner-email").fill(otherEmail!);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Could not update owner");
  });

  test("empty name is blocked by native validation", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#owner-full-name").fill("");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Owner updated|Could not update owner/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("disable then enable round-trips", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Disable" }).click();
    await expectToast(page, /access disabled/);
    await expect(ownerRow(page).getByText("disabled")).toBeVisible();
    await ownerRow(page).getByRole("button", { name: "Enable" }).click();
    await expectToast(page, /can now log in/);
    await expect(ownerRow(page).getByText("disabled")).toHaveCount(0);
  });

  test("Login (impersonate) button present on every row", async ({ page }) => {
    await page.goto("/platform/owners");
    await expect(ownerRow(page).getByRole("button", { name: "Login" })).toBeVisible({ timeout: 20000 });
  });

  test("empty state renders when no owners exist", async ({ page }) => {
    // Only assert the copy contract via the component's known string when the
    // live table is actually empty — on a seeded dev DB it never is, so this
    // pins the EmptyState heading ONLY if encountered; skip gracefully.
    await page.goto("/platform/owners");
    const empty = page.getByText("No gym owners yet");
    if ((await empty.count()) === 0) {
      test.skip(true, "live DB has owners — empty state not reachable here");
    }
    await expect(empty).toBeVisible();
  });
});
```

- [ ] **Step 2: Run**

Run: `cd apps/web && npx playwright test e2e/platform/owners.spec.ts`
Expected: all pass (empty-state test skips on a seeded DB — that's fine, skip is not fail).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/platform/owners.spec.ts
git commit -m "test(e2e): platform owners list, edit, password reset, disable"
```

---

### Task 6: subscriptions.spec.ts (serial)

**Files:**
- Create: `apps/web/e2e/platform/subscriptions.spec.ts`

The whole file runs in serial mode; each test builds on a known tier state. Seed tiers `enterprise/pro/starter` must NOT be mutated except via the in-use-guard tests (which leave them enabled/active).

- [ ] **Step 1: Write the spec**

`apps/web/e2e/platform/subscriptions.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ts, expectToast } from "./fixtures";

test.describe.configure({ mode: "serial" });

const T = ts();
const CODE = `pwsub-${T}`;
const NAME = "PW Sub Tier";

const card = (page: import("@playwright/test").Page, text: string) =>
  page.locator("div.rounded-2xl", { hasText: text }).first();

test.describe("subscriptions", () => {
  test("header shows plan count and New tier button", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await expect(page.getByText(/\d+ plans · \d+ available to gyms/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /new tier/i })).toBeVisible();
  });

  test("seeded tiers render with price and features", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    for (const name of ["Starter", "Pro", "Enterprise"]) {
      const c = card(page, name);
      await expect(c).toBeVisible({ timeout: 20000 });
      await expect(c).toContainText(/₹|Custom/);
      await expect(c).toContainText(/month/);
    }
    await expect(card(page, "Starter")).toContainText(/branch/i);
  });

  test("create tier happy path", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await page.getByRole("button", { name: /new tier/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#modal-title")).toHaveText("New subscription tier");
    await dialog.locator("#tier-code").fill(CODE);
    await dialog.locator("#tier-name").fill(NAME);
    await dialog.locator("#tier-monthly-price").fill("799");
    await dialog.locator("#tier-max-branches").fill("3");
    await dialog.locator("#tier-max-members").fill("500");
    await dialog.locator("#tier-description").fill("PW test tier");
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expectToast(page, "Tier created");
    await expect(card(page, NAME)).toBeVisible({ timeout: 15000 });
    await expect(card(page, NAME)).toContainText("₹799");
  });

  test("duplicate code surfaces Could not create tier", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await page.getByRole("button", { name: /new tier/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#tier-code").fill(CODE); // taken
    await dialog.locator("#tier-name").fill("PW Dup Tier");
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expectToast(page, "Could not create tier");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("invalid code pattern is blocked by native validation", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await page.getByRole("button", { name: /new tier/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#tier-code").fill("BAD CODE!"); // violates [a-z0-9-]+
    await dialog.locator("#tier-name").fill("PW Bad");
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Tier created|Could not create tier/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("edit tier updates name and price", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await card(page, NAME).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#modal-title")).toHaveText("Edit tier");
    await dialog.locator("#tier-name").fill(`${NAME} 2`);
    await dialog.locator("#tier-monthly-price").fill("899");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Tier updated");
    await expect(card(page, `${NAME} 2`)).toContainText("₹899");
  });

  test("disable + enable an unused tier round-trips", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    const c = card(page, `${NAME} 2`);
    await c.getByRole("switch").click();
    await expectToast(page, `${NAME} 2 is now disabled`);
    await expect(card(page, `${NAME} 2`).getByRole("switch")).toHaveAttribute("aria-checked", "false");
    await card(page, `${NAME} 2`).getByRole("switch").click();
    await expectToast(page, `${NAME} 2 is now active`);
    await expect(card(page, `${NAME} 2`).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("in-use tier cannot be disabled (guard keeps switch on)", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    // "Starter" is the default tier used by live gyms → in use.
    await card(page, "Starter").getByRole("switch").click();
    await expectToast(page, /Could not update tier: Tier is still referenced by gyms/);
    await expect(card(page, "Starter").getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("in-use tier cannot be deleted", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await card(page, "Starter").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete tier" }).click();
    await expectToast(page, /Could not delete tier/);
    await expect(card(page, "Starter")).toBeVisible();
  });

  test("delete unused tier removes the card", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await card(page, `${NAME} 2`).getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#modal-title")).toHaveText("Delete tier");
    await dialog.getByRole("button", { name: "Delete tier" }).click();
    await expectToast(page, new RegExp(`${NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} 2 deleted`));
    await expect(card(page, `${NAME} 2`)).toHaveCount(0);
  });

  test("price displays as Custom when price_minor is null", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await page.getByRole("button", { name: /new tier/i }).click();
    const dialog = page.getByRole("dialog");
    const code2 = `pwcust-${T}`;
    await dialog.locator("#tier-code").fill(code2);
    await dialog.locator("#tier-name").fill("PW Custom");
    // leave price empty
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expectToast(page, "Tier created");
    await expect(card(page, "PW Custom")).toContainText("Custom");
    // cleanup
    await card(page, "PW Custom").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete tier" }).click();
    await expectToast(page, /deleted/);
  });
});
```

- [ ] **Step 2: Run**

Run: `cd apps/web && npx playwright test e2e/platform/subscriptions.spec.ts`
Expected: all pass serially. If the in-use guard message differs, read the toast text from the failure and align the assertion to the BACKEND copy (`re-point those gyms before disabling`) — that string is authoritative.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/platform/subscriptions.spec.ts
git commit -m "test(e2e): subscription tier CRUD, guards, price display (serial)"
```

---

### Task 7: settings.spec.ts

**Files:**
- Create: `apps/web/e2e/platform/settings.spec.ts`

Port the 8 checks from the old `platform_admin_verify.cjs` settings section (lines ~270-410 — read them while implementing to keep parity), plus the new depth tests. The seeded admin name is read in `beforeAll` and restored in a `finally` inside the mutating test.

- [ ] **Step 1: Write the spec**

`apps/web/e2e/platform/settings.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { expectToast, dismissToasts } from "./fixtures";

test.describe("platform settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("#settings-first-name")).toBeVisible({ timeout: 20000 });
  });

  test("profile inputs render with frozen email", async ({ page }) => {
    await expect(page.locator("#settings-first-name")).toHaveValue(/.+/);
    await expect(page.locator("#settings-last-name")).toHaveValue(/.+/);
    const email = page.locator("#settings-email");
    await expect(email).toBeDisabled();
    await expect(email).toHaveAttribute("readonly", "");
    await expect(email).toHaveValue("admin@gym-erp.dev");
  });

  test("role and permissions sections are absent", async ({ page }) => {
    await expect(page.getByText("Granted permissions")).toHaveCount(0);
    await expect(page.getByText("Your role & permissions")).toHaveCount(0);
  });

  test("split-name save persists and restores the seeded name", async ({ page }) => {
    const first = page.locator("#settings-first-name");
    const last = page.locator("#settings-last-name");
    const seededFirst = await first.inputValue();
    const seededLast = await last.inputValue();
    try {
      await last.fill("E2E Temp");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expectToast(page, "Profile updated");
      await expect(page.locator("#settings-last-name")).toHaveValue("E2E Temp");
    } finally {
      await dismissToasts(page);
      await first.fill(seededFirst);
      await last.fill(seededLast);
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Profile updated")).toBeVisible({ timeout: 15000 });
    }
  });

  test("empty first name disables save", async ({ page }) => {
    const seeded = await page.locator("#settings-first-name").inputValue();
    try {
      await page.locator("#settings-first-name").fill("");
      await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
    } finally {
      await page.locator("#settings-first-name").fill(seeded);
    }
  });

  test("unicode name saves and restores", async ({ page }) => {
    const first = page.locator("#settings-first-name");
    const seeded = await first.inputValue();
    try {
      await first.fill("Åström-Ω");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expectToast(page, "Profile updated");
      await expect(page.locator("#settings-first-name")).toHaveValue("Åström-Ω");
    } finally {
      await dismissToasts(page);
      await first.fill(seeded);
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Profile updated")).toBeVisible({ timeout: 15000 });
    }
  });

  test("password card renders three inputs and submit button", async ({ page }) => {
    await expect(page.locator("#settings-current-password")).toBeVisible();
    await expect(page.locator("#settings-new-password")).toBeVisible();
    await expect(page.locator("#settings-confirm-password")).toBeVisible();
    await expect(page.getByRole("button", { name: /update password/i })).toBeVisible();
  });

  test("weak new password shows failing checklist rows and disables submit", async ({ page }) => {
    await page.locator("#settings-new-password").fill("alllowercase1!");
    const checklist = page.getByRole("list", { name: "Password strength" });
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText("✗").first()).toBeVisible();
    await expect(checklist.getByText("Uppercase letter")).toBeVisible();
    await expect(page.getByRole("button", { name: /update password/i })).toBeDisabled();
  });

  test("strong matching password enables submit; mismatch blocks", async ({ page }) => {
    await page.locator("#settings-current-password").fill("placeholder-not-submitted");
    await page.locator("#settings-new-password").fill("Owner-Pass-123!");
    await page.locator("#settings-confirm-password").fill("Owner-Pass-123!");
    const checklist = page.getByRole("list", { name: "Password strength" });
    await expect(checklist.getByText("✗")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /update password/i })).toBeEnabled();
    // mismatch
    await page.locator("#settings-confirm-password").fill("Owner-Pass-999!");
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await expect(page.getByRole("button", { name: /update password/i })).toBeDisabled();
    // clear — never submit
    await page.locator("#settings-current-password").fill("");
    await page.locator("#settings-new-password").fill("");
    await page.locator("#settings-confirm-password").fill("");
  });

  test("checklist transitions rule-by-rule as rules are satisfied", async ({ page }) => {
    const checklist = page.getByRole("list", { name: "Password strength" });
    const rowState = async (label: string) => {
      const row = checklist.locator("li", { hasText: label });
      return (await row.getByText("✓").count()) > 0;
    };
    await page.locator("#settings-new-password").fill("a");
    expect(await rowState("Lowercase letter")).toBe(true);
    expect(await rowState("Uppercase letter")).toBe(false);
    await page.locator("#settings-new-password").fill("aB");
    expect(await rowState("Uppercase letter")).toBe(true);
    await page.locator("#settings-new-password").fill("aB3");
    expect(await rowState("Number")).toBe(true);
    await page.locator("#settings-new-password").fill("aB3$");
    expect(await rowState("Special character")).toBe(true);
    await page.locator("#settings-new-password").fill("aB3$xyzz");
    expect(await rowState("At least 8 characters")).toBe(true);
    await page.locator("#settings-new-password").fill("");
  });

  test("page ends clean (no stray toast, empty password fields)", async ({ page }) => {
    await dismissToasts(page);
    await expect(page.locator("#settings-current-password")).toHaveValue("");
    await expect(page.locator("#settings-new-password")).toHaveValue("");
    await expect(page.locator("#settings-confirm-password")).toHaveValue("");
  });
});
```

- [ ] **Step 2: Run**

Run: `cd apps/web && npx playwright test e2e/platform/settings.spec.ts`
Expected: all pass. **Critical:** after the run, verify the admin fixture survived:

```bash
psql -h 127.0.0.1 -U amit -d gym_erp -c "select email, full_name from users where email='admin@gym-erp.dev'"
```

Expected: `Platform Admin`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/platform/settings.spec.ts
git commit -m "test(e2e): platform settings profile + password checklist depth"
```

---

### Task 8: impersonation.spec.ts

**Files:**
- Create: `apps/web/e2e/platform/impersonation.spec.ts`

- [ ] **Step 1: Write the spec**

`apps/web/e2e/platform/impersonation.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { ts, provisionGym, deleteGymIfExists, expectToast } from "./fixtures";

const T = ts();
const OWNER_EMAIL = `pw-imp-${T}@gym-erp.dev`;

test.describe("impersonation", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await provisionGym(page, {
      name: `PW ImpGym ${T}`, slug: `pw-imgym-${T}`, ownerName: "PW Imp",
      ownerEmail: OWNER_EMAIL, ownerPassword: "Pw-Provision-123!",
    });
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await deleteGymIfExists(page, `PW ImpGym ${T}`);
    await page.context().close();
  });

  const ownerRow = (page: import("@playwright/test").Page) =>
    page.locator("tr", { hasText: OWNER_EMAIL }).first();

  test("Login enters the gym workspace with the impersonation banner", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    await expect(page.getByText(/Viewing the gym workspace as/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(OWNER_EMAIL)).toBeVisible();
  });

  test("workspace nav swaps to gym links and hides platform links", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    await expect(page.getByRole("link", { name: "Members" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: "Gyms" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Revenue" })).toHaveCount(0);
  });

  test("Exit to platform restores /platform and clears the banner", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    await page.getByRole("button", { name: "Exit to platform" }).click();
    await page.waitForURL(/\/platform/, { timeout: 20000 });
    await expect(page.getByText(/Viewing the gym workspace as/)).toHaveCount(0);
    await expect(page.getByText("Gym subscriptions")).toBeVisible({ timeout: 15000 });
  });

  test("disabled owner blocks impersonation with an error toast", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Disable" }).click();
    await expectToast(page, /access disabled/);
    try {
      await ownerRow(page).getByRole("button", { name: "Login" }).click();
      await expectToast(page, "Could not open an owner session");
      await expect(page).toHaveURL(/\/platform\/owners/);
    } finally {
      await ownerRow(page).getByRole("button", { name: "Enable" }).click();
      await expectToast(page, /can now log in/);
    }
  });

  test("impersonated session shows Settings in workspace nav", async ({ page }) => {
    await page.goto("/platform/owners");
    await ownerRow(page).getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Exit to platform" }).click();
    await page.waitForURL(/\/platform/, { timeout: 20000 });
  });
});
```

Note: the disabled-owner test assumes the backend rejects impersonation for disabled owners (expect a 403/404 surfaced as the error toast). If the live behavior differs (e.g. button disabled client-side, or session still opens), read the actual behavior and align the test to it — report the deviation; do NOT force the toast if the UI blocks earlier.

- [ ] **Step 2: Run**

Run: `cd apps/web && npx playwright test e2e/platform/impersonation.spec.ts`
Expected: all pass, or only the disabled-owner test deviating — in that case align it per the note and re-run.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/platform/impersonation.spec.ts
git commit -m "test(e2e): impersonation enter/exit, nav swap, disabled-owner guard"
```

---

### Task 9: Retire old gate, AGENTS.md rule, full battery

**Files:**
- Delete: `apps/web/e2e/platform_admin_verify.cjs`
- Modify: `AGENTS.md`
- No app code changes.

- [ ] **Step 1: Delete the retired script**

```bash
git rm apps/web/e2e/platform_admin_verify.cjs
```

- [ ] **Step 2: Rewrite the AGENTS.md gate rule**

In `AGENTS.md`, replace the entire current "Rules" list item 3 block (the one containing `platform_admin_verify.cjs`) with:

```markdown
3. After **any** change to super-admin surfaces (`/platform/**`, the settings
   dispatcher / `PlatformSettings.tsx`) **or** shared files
   (`components/ui.tsx`, `components/skeleton*`, `lib/hooks.ts`, `lib/api.ts`,
   `(app)/layout.tsx`), run:

   ```bash
   cd apps/web && npx playwright test e2e/platform
   ```

   100% pass required. If a legitimate UI change breaks a test, **update the
   test in the same commit**. (`platform_admin_verify.cjs` retired; the other
   six e2e scripts remain house-style gates for their own domains.)
```

Then append this new section after the "Test fixture hygiene" section:

```markdown
## Playwright platform suite

The super-admin gate is a proper `@playwright/test` suite under
`apps/web/e2e/platform/`:

- `auth.setup.ts` logs in once per run (storageState); spec files never
  re-login.
- One spec per module: `overview`, `gyms`, `owners`, `subscriptions`,
  `settings`, `impersonation`. `subscriptions.spec.ts` is serial (tier state
  is shared); everything else is parallel-safe.
- Helpers in `fixtures.ts`: `provisionGym`, `deleteGymIfExists`, `expectToast`,
  `dismissToasts`, `ts()`. Toasts live in a persistent `div[role="status"]`
  portal and do NOT auto-dismiss.
- Data hygiene: throwaway gyms/tiers use timestamped names and are cleaned up
  in `afterAll`; tests that rename the admin restore `Platform`/`Admin` in a
  `finally`; NEVER submit a real password change for the admin (checklist
  state only — the API path is pytest's job).
- No `webServer` block in `playwright.config.ts` on purpose — the suite runs
  against the already-running `make dev` / `make web` servers.
- The six remaining house-style scripts (`gym_ops`, `plans`,
  `member_account`, `role_visibility`, `frontdesk`, `expenses`) are unchanged
  and still run with
  `NODE_PATH="$(npm root -g)" node e2e/<name>_verify.cjs`.
```

- [ ] **Step 3: Full battery**

Run in order, wait for each:

```bash
cd backend && .venv/bin/python -m pytest 2>&1 | tail -2 && .venv/bin/ruff check app tests scripts alembic
cd ../apps/web && npx tsc --noEmit && npm test 2>&1 | tail -3
cd apps/web && npx playwright test e2e/platform
for s in gym_ops plans member_account role_visibility frontdesk expenses; do printf "%-18s " "$s"; NODE_PATH="$(npm root -g)" node "e2e/${s}_verify.cjs" 2>&1 | tail -1; done
```

Expected:
- pytest **105 passed**, ruff clean
- tsc clean, unit **17 pass**
- playwright platform suite **100%** (auth-setup + ~50-60 test blocks; nested expects make the true assertion count higher)
- gym_ops **33/33**, plans **9/9**, member_account **15/15**, role_visibility **18/18**, frontdesk **29/29**, expenses **13/13**
- Post-battery fixture check:

```bash
psql -h 127.0.0.1 -U amit -d gym_erp -c "select email, full_name from users where email='admin@gym-erp.dev'"
psql -h 127.0.0.1 -U amit -d gym_erp -c "select count(*) from gyms where name like 'PW %'"
```

Expected: `Platform Admin`; PW gyms count **0** (all cleaned up).

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): platform gate → playwright suite; retire verify script

Rule 3 now names npx playwright test e2e/platform with the
update-stale-tests-in-same-commit clause; suite conventions documented."
```

(Step 1's `git rm` is staged separately or together — one commit total is fine since it's the same logical change.)

---

## Self-review notes (already applied)

- Spec coverage: infra (T1), all six modules (T2-8), retirement + AGENTS.md (T9), depth matrix rows map to the named tests above.
- No placeholders: every task has complete code; the only "align to actual behavior" notes are deliberate (UI details the plan cannot know without running: disabled-owner impersonation outcome, in-use toast exact wrap).
- Type consistency: `fixtures.ts` exports (`ts`, `provisionGym`, `deleteGymIfExists`, `expectToast`, `dismissToasts`, `gymRow`, `ProvisionGymOpts`) match every import across tasks.
