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
    await dialog.locator("#tier-code").fill(CODE);
    await dialog.locator("#tier-name").fill("PW Dup Tier");
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expectToast(page, "Could not create tier");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("invalid code pattern is blocked by native validation", async ({ page }) => {
    await page.goto("/platform/subscriptions");
    await page.getByRole("button", { name: /new tier/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#tier-code").fill("BAD CODE!");
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
    await dialog.getByRole("button", { name: "Create tier" }).click();
    await expectToast(page, "Tier created");
    await expect(card(page, "PW Custom")).toContainText("Custom");
    await card(page, "PW Custom").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete tier" }).click();
    await expectToast(page, /deleted/);
  });
});
