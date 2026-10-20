import { expect, type Page } from "@playwright/test";

export function ts(): string {
  return Date.now().toString(36);
}

export async function dismissToasts(page: Page): Promise<void> {
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  while ((await dismiss.count()) > 0) {
    await dismiss.first().click();
  }
}

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).last()).toBeVisible({ timeout: 15000 });
  await dismissToasts(page);
}

export type ProvisionGymOpts = {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  tierCode?: string;
};

export async function provisionGym(page: Page, opts: ProvisionGymOpts): Promise<void> {
  await page.goto("/platform/gyms");
  await page.getByRole("button", { name: "Provision gym" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#gym-name").fill(opts.name);
  await dialog.locator("#gym-slug").fill(opts.slug);
  if (opts.tierCode) await dialog.locator("#gym-tier").selectOption(opts.tierCode);
  await dialog.locator("#gym-owner-name").fill(opts.ownerName);
  await dialog.locator("#gym-owner-email").fill(opts.ownerEmail);
  await dialog.locator("#gym-owner-password").fill(opts.ownerPassword);
  await dialog.getByRole("button", { name: "Provision gym" }).click();
  await expectToast(page, "Gym provisioned — owner can log in now");
}

export async function deleteGymIfExists(page: Page, name: string): Promise<void> {
  await page.goto("/platform/gyms");
  // Settle: the count header only renders after the list fetch resolves
  // (Count renders a skeleton while loading), so waiting for it removes the
  // early-return race where row.count() === 0 before data arrives.
  await expect(page.getByText(/\d+ gyms on the platform/)).toBeVisible({ timeout: 20000 });
  const row = page.locator("tr", { hasText: name }).first();
  if ((await row.count()) === 0) return;
  if ((await row.getByRole("button", { name: "Delete" }).count()) === 0) return;
  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete gym" }).click();
  await expectToast(page, `${name} deleted`);
}

export function gymRow(page: Page, name: string) {
  return page.locator("tr", { hasText: name }).first();
}
