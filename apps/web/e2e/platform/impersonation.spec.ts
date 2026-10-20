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
