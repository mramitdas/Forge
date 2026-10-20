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
