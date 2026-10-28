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
    await expect(email).toHaveValue(process.env.GYM_PLATFORM_ADMIN_EMAIL ?? "");
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
    await page.locator("#settings-confirm-password").fill("Owner-Pass-999!");
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await expect(page.getByRole("button", { name: /update password/i })).toBeDisabled();
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
