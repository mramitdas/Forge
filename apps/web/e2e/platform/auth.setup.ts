import { test as setup, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.GYM_PLATFORM_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.GYM_PLATFORM_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "GYM_PLATFORM_ADMIN_EMAIL and GYM_PLATFORM_ADMIN_PASSWORD must be set (backend/.env or shell) before running the platform e2e suite.",
  );
}
const ADMIN = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
const AUTH_FILE = "test-results/.auth/admin.json";

setup("authenticate as platform admin", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: /enter forge/i }).click();
  await page.waitForURL(/\/platform/, { timeout: 20000 });
  await expect(page.getByRole("button", { name: /exit to platform/i })).toHaveCount(0);

  // Warm up: pre-compile every platform route with this ONE browser so the
  // parallel phase never triggers a Next dev compile storm (the main cause of
  // >50% CPU spikes). Sequential gotos are cheap on a warm cache (~2s).
  for (const route of [
    "/platform",
    "/platform/gyms",
    "/platform/owners",
    "/platform/subscriptions",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible({ timeout: 20000 });
  }

  await page.context().storageState({ path: AUTH_FILE });
});
