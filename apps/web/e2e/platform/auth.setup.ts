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
