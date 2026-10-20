import { test, expect } from "@playwright/test";
import { ts, provisionGym, deleteGymIfExists, expectToast, gymRow } from "./fixtures";

const T = ts();
const GYM = `PW Gym ${T}`;
const SLUG = `pw-${T}`;
const OWNER_EMAIL = `pw-owner-${T}@gym-erp.dev`;
const OWNER_PASSWORD = "Pw-Provision-123!";

test.describe("gyms — provision & edit", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60000);
    const page = await (await browser.newContext()).newPage();
    // Idempotent on retry: a prior attempt's afterAll may have raced the
    // delete and left the throwaway gym behind → slug conflict on re-provision.
    await deleteGymIfExists(page, GYM);
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
    // Tier is the 4th column — row-level match could false-pass on the slug.
    await expect(row.locator("td").nth(3)).toContainText(/starter|pro|enterprise/);
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
    await dialog.locator("#gym-slug").fill(SLUG);
    await dialog.locator("#gym-owner-name").fill("PW Dup");
    await dialog.locator("#gym-owner-email").fill(`pw-dup-${T}@gym-erp.dev`);
    await dialog.locator("#gym-owner-password").fill(OWNER_PASSWORD);
    await dialog.getByRole("button", { name: "Provision gym" }).click();
    await expectToast(page, "Could not provision gym");
    await expect(dialog).toBeVisible();
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
    await dialog.locator("#gym-owner-password").fill("weak123");
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
    await expect(row).toContainText("Europe/Paris", { timeout: 15000 });
    await expect(row).toContainText("USD", { timeout: 15000 });
    await expect(row.locator("td").nth(3)).toHaveText("pro", { timeout: 15000 });
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
    const flipped = before === "true" ? "false" : "true";
    await expect(gymRow(page, GYM).getByRole("switch", { name: `Cross-branch access for ${GYM}` })).toHaveAttribute(
      "aria-checked", flipped, { timeout: 15000 },
    );
    await gymRow(page, GYM).getByRole("switch", { name: `Cross-branch access for ${GYM}` }).click();
    await expectToast(page, "Gym setting updated");
    await expect(gymRow(page, GYM).getByRole("switch", { name: `Cross-branch access for ${GYM}` })).toHaveAttribute(
      "aria-checked", before, { timeout: 15000 },
    );
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

test.describe("gyms — lifecycle", () => {
  const T = ts();
  const GYM = `PW Life ${T}`;
  const SLUG = `pw-life-${T}`;
  const OWNER_EMAIL = `pw-life-${T}@gym-erp.dev`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(90000);
    const page = await (await browser.newContext()).newPage();
    // Idempotent on retry: clear any leftover from a prior attempt first.
    await deleteGymIfExists(page, GYM);
    await provisionGym(page, {
      name: GYM, slug: SLUG, ownerName: "PW Life",
      ownerEmail: OWNER_EMAIL, ownerPassword: "Pw-Provision-123!",
    });
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(90000);
    const page = await (await browser.newContext()).newPage();
    await page.goto("/platform/gyms");
    const row = gymRow(page, GYM);
    try {
      await expect(row).toBeVisible({ timeout: 20000 });
      await row.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
      await expectToast(page, `${GYM} deleted`);
    } catch {
      // gym already gone or delete unavailable — cleanup is best-effort
    }
    await page.context().close();
  });

  test("suspend then enable round-trips", async ({ page }) => {
    await page.goto("/platform/gyms");
    await gymRow(page, GYM).getByRole("button", { name: "Suspend" }).click();
    await expectToast(page, `${GYM} suspended`);
    await expect(gymRow(page, GYM).getByText("suspended")).toBeVisible({ timeout: 15000 });
    await gymRow(page, GYM).getByRole("button", { name: "Enable" }).click();
    await expectToast(page, `${GYM} is now active`);
    await expect(gymRow(page, GYM).getByText(/active|trial/)).toBeVisible({ timeout: 15000 });
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
    test.setTimeout(120000);
    // The real trigger is TIER_MISSING/TIER_DISABLED on restore:
    // create tier → provision gym on it → delete gym → disable tier →
    // restore → Attach a subscription modal → pick tier → restore succeeds.
    // Fresh ids per run (incl. retries): a mid-test failure + retry would
    // otherwise hit TIER_EXISTS / SLUG_TAKEN on the module-level T.
    const t = ts();
    const tierCode = `pwlife-${t}`;
    const name2 = `PW Life2 ${t}`;

    await page.goto("/platform/subscriptions");
    await page.getByRole("button", { name: /new tier/i }).click();
    let dialog = page.getByRole("dialog");
    await dialog.locator("#tier-code").fill(tierCode);
    await dialog.locator("#tier-name").fill("PW Life Tier");
    await dialog.locator("#tier-monthly-price").fill("499");
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expectToast(page, "Tier created");

    await provisionGym(page, {
      name: name2, slug: `pw-life2-${t}`, ownerName: "PW Life2",
      ownerEmail: `pw-life2-${t}@gym-erp.dev`, ownerPassword: "Pw-Provision-123!",
      tierCode,
    });

    await page.goto("/platform/gyms");
    await gymRow(page, name2).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
    await expectToast(page, `${name2} deleted`);

    await page.goto("/platform/subscriptions");
    await page.locator("div.rounded-2xl", { hasText: tierCode }).first().getByRole("switch").click();
    await expectToast(page, /is now disabled/);

    await page.goto("/platform/gyms");
    await page.getByLabel("Show deleted").check();
    await gymRow(page, name2).getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("dialog").locator("#modal-title")).toHaveText("Attach a subscription", { timeout: 15000 });
    // Attach dropdown lists only ACTIVE tiers (backend restore also rejects
    // inactive tier_code), so the disabled pwlife tier can't be re-selected —
    // attach the seeded active "starter" tier instead. Assert the option is
    // rendered first (a bare option-count check would pass on the always-
    // present "Select a tier…" placeholder while tiers are still loading).
    const attachDialog = page.getByRole("dialog");
    await expect(attachDialog.locator('#attach-tier option[value="starter"]')).toHaveCount(1, { timeout: 15000 });
    await attachDialog.locator("#attach-tier").selectOption("starter");
    await attachDialog.getByRole("button", { name: "Restore gym" }).click();
    await expectToast(page, `${name2} restored`);
    await page.getByLabel("Show deleted").uncheck();

    await expect(gymRow(page, name2)).toBeVisible({ timeout: 15000 });
    await expect(gymRow(page, name2).locator("td").nth(3)).toContainText("starter");
    await gymRow(page, name2).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
    await expectToast(page, `${name2} deleted`);

    await page.goto("/platform/subscriptions");
    await page.locator("div.rounded-2xl", { hasText: tierCode }).first().getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete tier" }).click();
    await expectToast(page, /deleted/);
  });

  test("Show deleted checkbox toggles the filtered query", async ({ page }) => {
    await page.goto("/platform/gyms");
    // GYM is never deleted at this point (runs last, prior tests restore it),
    // so it must stay visible across the refetch the checkbox triggers.
    await expect(gymRow(page, GYM)).toBeVisible({ timeout: 20000 });
    await page.getByLabel("Show deleted").check();
    await expect(page.getByLabel("Show deleted")).toBeChecked();
    await expect(gymRow(page, GYM)).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Show deleted").uncheck();
    await expect(page.getByLabel("Show deleted")).not.toBeChecked();
    await expect(gymRow(page, GYM)).toBeVisible({ timeout: 15000 });
  });
});
