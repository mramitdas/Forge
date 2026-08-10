// Platform admin panel — v1 REGRESSION GATE.
//
// The platform admin console (/platform, gym/owner management, subscription
// tiers, revenue) is FROZEN for v1. This script is the gate: before merging
// any change that touches shared UI (components/ui, components/skeleton*,
// lib/hooks, lib/api, (app)/layout) or anything under /platform, you MUST
// run it and get 100% PASS.
//
//   cd apps/web && NODE_PATH="$(npm root -g)" node e2e/platform_admin_verify.cjs
//
// Requires the backend + frontend dev servers running locally.
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const ADMIN = { email: "admin@gym-erp.dev", password: "admin-pass-123" };
const ts = Date.now().toString(36);
const SLUG = `verify-${ts}`;
const OWNER_EMAIL = `verify-owner-${ts}@gym-erp.dev`;

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    // ── Login as platform admin ──
    await page.goto(`${BASE}/login`);
    await page.locator('input[type="email"]').fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole("button", { name: /enter forge/i }).click();
    await page.waitForURL(/\/platform/, { timeout: 20000 });
    check("platform admin login redirects to /platform", true, page.url());

    // ── Gyms: provision ──
    await page.goto(`${BASE}/platform/gyms`);
    await page.getByRole("button", { name: /provision gym/i }).click();
    await page.locator('input[placeholder="e.g. Iron Temple"]').fill(`Verify Gym ${ts}`);
    await page.locator('input[placeholder="e.g. iron-temple"]').fill(SLUG);
    await page.locator('input[placeholder="e.g. Aisha Kapoor"]').fill("Verify Owner");
    await page.locator('input[placeholder="owner@gym.com"]').fill(OWNER_EMAIL);
    await page.locator('input[placeholder="min 8 chars"]').fill("verify-pass-123");
    await page.getByRole("button", { name: /provision gym/i }).last().click();
    await page.getByText(`Verify Gym ${ts}`, { exact: true }).first().waitFor({ timeout: 20000 });
    check("gym provisioned and appears in table", true);

    // ── Gyms: edit (timezone + currency dropdowns) ──
    let row = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await row.getByRole("button", { name: "Edit" }).click();
    await page.locator("select").nth(0).selectOption("Europe/Paris");
    await page.locator("select").nth(1).selectOption("USD");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Gym updated").waitFor({ timeout: 10000 });
    await page.locator("tr", { hasText: "Europe/Paris" }).first().waitFor({ timeout: 15000 });
    const gymRowText = await page.locator("tr", { hasText: `Verify Gym ${ts}` }).first().innerText();
    check("gym edit modal updates timezone/currency dropdowns", gymRowText.includes("USD"), gymRowText.slice(0, 80));

    // ── Gyms: suspend / enable ──
    row = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await row.getByRole("button", { name: "Suspend" }).click();
    await page.getByText(new RegExp(`Verify Gym ${ts} suspended`)).waitFor({ timeout: 10000 });
    check("gym suspended", true);
    row = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await row.getByRole("button", { name: "Enable" }).click();
    await page.getByText(new RegExp(`Verify Gym ${ts} is now active`)).waitFor({ timeout: 10000 });
    check("gym enabled again", true);

    // ── Owners: edit (password reset) ──
    await page.goto(`${BASE}/platform/owners`);
    let oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.waitFor({ timeout: 15000 });
    await oRow.getByRole("button", { name: "Edit" }).click();
    await page.locator('input[placeholder="Leave blank to keep current"]').fill("verify-pass-456");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Owner updated").waitFor({ timeout: 10000 });
    check("owner edit (password reset) succeeds", true);

    // ── Owners: disable / enable ──
    oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.getByRole("button", { name: "Disable" }).click();
    await page.getByText("access disabled").waitFor({ timeout: 10000 });
    const disabledText = await page.locator("tr", { hasText: OWNER_EMAIL }).first().innerText();
    check("owner disabled", disabledText.includes("disabled"), disabledText.slice(0, 80));
    oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.getByRole("button", { name: "Enable" }).click();
    await page.getByText("can now log in").waitFor({ timeout: 10000 });
    check("owner enabled again", true);

    // ── Owners: login as owner + exit ──
    oRow = page.locator("tr", { hasText: OWNER_EMAIL }).first();
    await oRow.getByRole("button", { name: "Login" }).click();
    await page.waitForURL(/\/$/, { timeout: 20000 });
    await page.getByText(/Viewing the gym workspace as/).waitFor({ timeout: 10000 });
    check("login-as-owner enters gym workspace with banner", true, page.url());
    check("gym nav visible (Members link)", (await page.locator("a", { hasText: "Members" }).count()) > 0);

    await page.getByRole("button", { name: "Exit to platform" }).click();
    await page.waitForURL(/\/platform/, { timeout: 20000 });
    await page.getByText("Gym subscriptions").first().waitFor({ timeout: 15000 });
    const bannerCount = await page.getByText(/Viewing the gym workspace as/).count();
    check("exit impersonation returns to platform", bannerCount === 0, page.url());

    // ── Gyms: delete (must run after owner tests since it disables the owner) ──
    await page.goto(`${BASE}/platform/gyms`);
    const delRow = page.locator("tr", { hasText: `Verify Gym ${ts}` }).first();
    await delRow.waitFor({ timeout: 15000 });
    await delRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete gym/i }).click();
    await page.getByText(new RegExp(`Verify Gym ${ts} deleted`)).waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const stillThere = await page.locator("tr", { hasText: `Verify Gym ${ts}` }).count();
    check("gym deleted from table", stillThere === 0, `remaining rows=${stillThere}`);

    // ── Subscriptions: change tier via overview dropdown ──
    await page.goto(`${BASE}/platform`);
    await page.getByText("Gym subscriptions").waitFor({ timeout: 10000 });
    const tierSelect = page.locator('table select').first();
    await tierSelect.selectOption({ label: "Pro" });
    await page.getByText("Subscription tier updated").waitFor({ timeout: 10000 });
    check("subscription tier changed via overview dropdown", true);

    // ── Platform subscriptions: pricing cards + tier CRUD ──
    await page.goto(`${BASE}/platform/subscriptions`);
    await page.getByRole("button", { name: /new tier/i }).waitFor({ timeout: 15000 });
    await page.getByText("Starter", { exact: true }).waitFor({ timeout: 15000 });
    const priceShown = await page.getByText("₹299").count();
    check("pricing cards render with price", priceShown > 0, `starter price rows=${priceShown}`);

    await page.getByRole("button", { name: /new tier/i }).click();
    await page.locator('input[placeholder="e.g. premium"]').fill(`v-tier-${ts}`);
    await page.locator('input[placeholder="e.g. Premium"]').fill("Verify Tier");
    await page.locator('input[placeholder="e.g. 799"]').fill("599");
    await page.locator('input[placeholder="e.g. For growing operators"]').fill("Tier created during verification");
    await page.getByRole("button", { name: /create tier/i }).click();
    await page.getByText("Tier created").waitFor({ timeout: 10000 });
    await page.getByText("Verify Tier", { exact: true }).waitFor({ timeout: 15000 });
    check("tier created via modal", true);

    let tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier" }).first();
    await tierCard.getByRole("button", { name: "Edit" }).click();
    await page.locator('input[placeholder="e.g. Premium"]').fill("Verify Tier Plus");
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.getByText("Tier updated").waitFor({ timeout: 10000 });
    await page.getByText("Verify Tier Plus", { exact: true }).waitFor({ timeout: 15000 });
    check("tier edited via modal", true);

    tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier Plus" }).first();
    await tierCard.getByRole("switch", { name: "Toggle Verify Tier Plus" }).click();
    await page.getByText("Verify Tier Plus is now disabled").waitFor({ timeout: 10000 });
    check("tier disabled via switch", true);
    tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier Plus" }).first();
    await tierCard.getByRole("switch", { name: "Toggle Verify Tier Plus" }).click();
    await page.getByText("Verify Tier Plus is now active").waitFor({ timeout: 10000 });
    check("tier re-enabled via switch", true);

    tierCard = page.locator("div.rounded-2xl").filter({ hasText: "Verify Tier Plus" }).first();
    await tierCard.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: /delete tier/i }).click();
    await page.getByText("Verify Tier Plus deleted").waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const tierGone = await page.getByText("Verify Tier Plus", { exact: true }).count();
    check("tier deleted from list", tierGone === 0, `remaining=${tierGone}`);

    // ── Platform revenue: MoM chart + sold list ──
    await page.goto(`${BASE}/platform/revenue`);
    await page.getByText("Subscription revenue").waitFor({ timeout: 15000 });
    const bars = await page.locator(".flex.h-44 > div").count();
    check("revenue MoM chart renders 12 month bars", bars === 12, `bars=${bars}`);
    await page.waitForTimeout(800);
    const firstBar = await page.locator(".flex.h-44 > div").first().locator("> div").first().boundingBox();
    check("revenue bars have visible height", !!firstBar && firstBar.height > 2, firstBar ? `h=${firstBar.height.toFixed(1)}` : "no box");
    await page.getByText("Subscriptions sold", { exact: true }).waitFor({ timeout: 15000 });
    check("revenue sold list section renders", true);
  } catch (err) {
    check("unexpected failure", false, String(err).slice(0, 300));
    await page.screenshot({ path: "/tmp/opencode/platform_verify_fail.png", fullPage: true }).catch(() => {});
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
