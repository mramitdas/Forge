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
  // "Gym owners" also exists in the platform nav; scope to main content kickers.
  for (const label of ["Total gyms", "Active gyms", "Gym owners", "Monthly revenue"]) {
    await expect(
      page.getByRole("main").locator("p.kicker", { hasText: new RegExp(`^${label}$`) })
    ).toBeVisible({ timeout: 20000 });
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
