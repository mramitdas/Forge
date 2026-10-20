import { test, expect } from "@playwright/test";
import { ts, provisionGym, deleteGymIfExists, expectToast, gymRow } from "./fixtures";

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
    await expect(row).toContainText("Europe/Paris");
    await expect(row).toContainText("USD");
    await expect(row).toContainText("pro");
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
