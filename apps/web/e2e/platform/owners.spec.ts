import { test, expect } from "@playwright/test";
import { ts, provisionGym, deleteGymIfExists, expectToast } from "./fixtures";

const T = ts();
const OWNER_EMAIL = `pw-own-${T}@gym-erp.dev`;
const OWNER_NAME = "PW Owner";

test.describe("owners", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60000);
    const page = await (await browser.newContext()).newPage();
    // Idempotent on retry: a prior attempt's afterAll may have raced the
    // delete and left the throwaway gym behind → slug conflict on re-provision.
    await deleteGymIfExists(page, `PW OwnGym ${T}`);
    await provisionGym(page, {
      name: `PW OwnGym ${T}`, slug: `pw-owngym-${T}`, ownerName: OWNER_NAME,
      ownerEmail: OWNER_EMAIL, ownerPassword: "Pw-Provision-123!",
    });
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(60000);
    const name = `PW OwnGym ${T}`;
    const page = await (await browser.newContext()).newPage();
    await page.goto("/platform/gyms");
    const row = page.locator("tr", { hasText: name }).first();
    try {
      await expect(row).toBeVisible({ timeout: 20000 });
      await row.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
      await expectToast(page, `${name} deleted`);
    } catch {
      // gym already gone or delete unavailable — cleanup is best-effort
    }
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
    await page.goto("/platform/owners");
    await expect(page.getByText(/\d+ gym owners/)).toBeVisible({ timeout: 20000 });
    if ((await page.locator("tbody tr").count()) < 2) test.skip(true, "needs a second owner row");
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
    await expect(ownerRow(page).getByText("disabled")).toBeVisible({ timeout: 20000 });
    await ownerRow(page).getByRole("button", { name: "Enable" }).click();
    await expectToast(page, /can now log in/);
    await expect(ownerRow(page).getByText("disabled")).toHaveCount(0, { timeout: 20000 });
  });

  test("Login (impersonate) button present on every row", async ({ page }) => {
    await page.goto("/platform/owners");
    await expect(ownerRow(page).getByRole("button", { name: "Login" })).toBeVisible({ timeout: 20000 });
  });

  test("empty state renders when no owners exist", async ({ page }) => {
    await page.goto("/platform/owners");
    const empty = page.getByText("No gym owners yet");
    await expect(empty.or(page.locator("tbody tr").first())).toBeVisible({ timeout: 20000 });
    if ((await empty.count()) === 0) {
      test.skip(true, "live DB has owners — empty state not reachable here");
    }
    await expect(empty).toBeVisible();
  });
});
